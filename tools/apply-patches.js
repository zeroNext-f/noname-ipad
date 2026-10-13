/*
 * 无名杀 iPad 移植 —— 一键应用所有移植补丁
 * ==================================================================
 * 背景：payload/ 目录（游戏本体数据，2.5 GB）被 .gitignore 排除，
 *       所以对游戏数据的修改不会进仓库。本脚本把这些修改固化成代码，
 *       任何人在任何机器上执行：
 *
 *           node tools/prepare.ps1 的等价步骤（解压游戏）
 *           node tools/apply-patches.js
 *
 *       就能得到与开发时完全一致的"已移植"数据。
 *
 * 用法：
 *      node tools/apply-patches.js
 *      node tools/apply-patches.js --game "D:\其它位置\game"
 *
 * 特性：**幂等** —— 重复执行安全，已打过的补丁会被识别并跳过。
 */
'use strict';

const fs = require('fs');
const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const GAME = path.resolve(arg('game', path.join(__dirname, '..', 'payload', 'game')));
const REL = (p) => path.join(GAME, p);

if (!fs.existsSync(path.join(GAME, 'game', 'game.js'))) {
  console.error('✗ 找不到游戏数据：' + GAME);
  console.error('  请先运行 tools/prepare.ps1，或用 --game 指定游戏根目录。');
  process.exit(1);
}

let applied = 0, skipped = 0, failed = 0;

/** 通用：把文件里的 oldStr 换成 newStr（幂等） */
function patch(rel, marker, oldStr, newStr, note) {
  const file = REL(rel);
  if (!fs.existsSync(file)) {
    console.log(`  ✗ 文件不存在: ${rel}`);
    failed++;
    return;
  }
  let t = fs.readFileSync(file, 'utf8');
  if (marker && t.includes(marker)) {
    console.log(`  ○ 已打过: ${note}  [${rel}]`);
    skipped++;
    return;
  }
  if (!t.includes(oldStr)) {
    console.log(`  ✗ 未找到目标代码: ${note}  [${rel}]`);
    failed++;
    return;
  }
  t = t.replace(oldStr, newStr);
  fs.writeFileSync(file, t, 'utf8');
  console.log(`  ✓ 已应用: ${note}  [${rel}]`);
  applied++;
}

console.log('游戏数据目录：' + GAME);
console.log('');

/* ============================================================
 * 补丁 1：扩展「如真似幻」的启动跳转地址
 * 原代码写死安卓专有路径 file:///android_asset/www/index.html，
 * iOS 上不存在 → 点「开始游戏」黑屏。改成按平台自动选择。
 * ============================================================ */
console.log('【补丁 1】如真似幻 · 启动跳转地址');
patch(
  'extension/如真似幻/js/rzsh.js',
  'li1mgmx0Ia + "index.html"',
  'li1mgmx0Ig = "file:///android_asset/www/index.html"',
  'li1mgmx0Ig = /android/i.test(navigator.userAgent) ? "file:///android_asset/www/index.html" : li1mgmx0Ia + "index.html"',
  '按平台选择跳转地址'
);

/* ============================================================
 * 补丁 2：禁用「更新日志含诗筏即重载」的保护
 * 整合包的扩展更新日志里带「诗筏」二字，会触发 game.reload()
 * 造成循环重载（表现为画面每隔一段时间闪一下）。
 * ============================================================ */
console.log('【补丁 2】game.js · 禁用「诗筏」重载保护');
patch(
  'game/game.js',
  'patched-out by iOS port',
  "for (let i = 0; i < lib.changeLog.length; i++) { if (lib.changeLog[i].includes(lib.init.decode('6K+X562P'))) { game.reload(); } }",
  "for (let i = 0; i < lib.changeLog.length; i++) { /* patched-out by iOS port */ }",
  '禁用诗筏重载保护'
);

/* ============================================================
 * 补丁 3：requestIdleCallback polyfill
 * Chromium 专有 API，WebKit/Safari 没有实现。十周年UI、皮肤切换
 * 用它驱动动画主循环，缺失会抛 ReferenceError 导致对局卡死。
 * 放在 update.js（游戏加载的第一个脚本），保证扩展加载前就位。
 * 调度用 ≤16ms（约 60fps），避免 1ms 轮询白白吃 CPU。
 * ============================================================ */
console.log('【补丁 3】update.js · requestIdleCallback polyfill');
const POLY = `/* ---------------------------------------------------------------
 * iOS 移植补丁：requestIdleCallback polyfill
 * requestIdleCallback / cancelIdleCallback 是 Chromium 专有 API，
 * Safari / WebKit（含 WKWebView）并未实现。十周年UI、皮肤切换等扩展
 * 用它驱动动画主循环，缺失时调用处会抛 ReferenceError，导致对局卡死。
 * 本文件是游戏加载的第一个脚本，在此打补丁可确保所有扩展加载前就位。
 * --------------------------------------------------------------- */
(function () {
    if (typeof window.requestIdleCallback === 'function') {
        console.log('[iOS-port] requestIdleCallback already exists');
        return;
    }
    window.requestIdleCallback = function (cb, options) {
        var start = Date.now();
        var limit = (options && typeof options.timeout === 'number') ? options.timeout : 50;
        return setTimeout(function () {
            try {
                cb({
                    didTimeout: false,
                    timeRemaining: function () {
                        return Math.max(0, limit - (Date.now() - start));
                    }
                });
            } catch (e) {
                if (window.console) console.error('[idle-polyfill]', e);
            }
        }, Math.min(limit, 16));
    };
    window.cancelIdleCallback = function (id) { clearTimeout(id); };
    if (window.console) console.log('[iOS-port] requestIdleCallback polyfill INSTALLED');
}());


`;
(function () {
  const rel = 'game/update.js';
  const file = REL(rel);
  if (!fs.existsSync(file)) { console.log('  ✗ 文件不存在: ' + rel); failed++; return; }
  let t = fs.readFileSync(file, 'utf8');
  if (t.includes('requestIdleCallback polyfill INSTALLED')) {
    console.log('  ○ 已打过: requestIdleCallback polyfill  [' + rel + ']');
    skipped++;
    return;
  }
  fs.writeFileSync(file, POLY + t, 'utf8');
  console.log('  ✓ 已应用: requestIdleCallback polyfill  [' + rel + ']');
  applied++;
}());

/* ============================================================
 * 补丁 4：十周年UI 手牌布局判空
 * meihua.js 的手牌布局函数直接访问 ui.skillControl.node，
 * 而 ui.skillControl 由其他扩展创建、可能还没就绪 → 抛异常
 * → 手牌无法布局 → 卡在屏幕中间。加判空保护。
 * ============================================================ */
console.log('【补丁 4】十周年UI · 手牌布局判空');
patch(
  'extension/十周年UI/meihua.js',
  'ui.skillControl && ui.skillControl.node &&',
  'var pw = ui.skillControl.node.enable.childNodes.length > 2 ? 0.95 * bounds.width : 0.996 * bounds.width;',
  'var pw = (ui.skillControl && ui.skillControl.node && ui.skillControl.node.enable && ui.skillControl.node.enable.childNodes.length > 2) ? 0.95 * bounds.width : 0.996 * bounds.width;',
  '手牌布局判空'
);

/* ============================================================
 * 补丁 7：十周年UI 的 ui.confirm / ui.confirm.node 判空
 * 该扩展访问 ui.confirm.node.cancel 时不做判空，而 ui.confirm
 * 可能尚未创建（作者自己在别处是判空的）。用可选链兜底，
 * 缺失时变成对空对象的无害赋值。
 * ============================================================ */
console.log('【补丁 7】十周年UI · ui.confirm 判空（可选链）');
(function () {
  const rels = [
    'extension/十周年UI/extension.js',
    'extension/十周年UI/meihua.js',
    'extension/十周年UI/markskill.js',
    'extension/十周年UI/markskill_noname.js',
  ];
  const rules = [
    [/ui\.confirm\.node\.cancel\.style\.display/g, '(ui.confirm?.node?.cancel?.style||{}).display'],
    [/ui\.confirm\.node\.cancel\.innerHTML/g, '(ui.confirm?.node?.cancel||{}).innerHTML'],
    [/ui\.confirm\.lastChild\.innerHTML/g, '(ui.confirm?.lastChild||{}).innerHTML'],
  ];
  let any = 0;
  for (const rel of rels) {
    const file = REL(rel);
    if (!fs.existsSync(file)) { continue; }
    let t = fs.readFileSync(file, 'utf8');
    if (t.includes('ui.confirm?.node?.cancel')) { console.log(`  ○ 已打过: [${rel}]`); skipped++; continue; }
    let n = 0;
    for (const [re, rep] of rules) { const m = t.match(re); if (m) { n += m.length; t = t.replace(re, rep); } }
    if (n > 0) { fs.writeFileSync(file, t, 'utf8'); console.log(`  ✓ 已应用 ${n} 处: [${rel}]`); applied++; any += n; }
  }
  if (any === 0) { /* 全部已处理 */ }
}());

/* ============================================================
 * 补丁 8：扩展「Thunder」的 spine 判空（防对局卡死）
 * Thunder 的「神宫」场景直接 dcdAnim.playSpine(...).moveTo()，
 * spine 是异步加载的，首次调用返回 undefined → 抛异常。
 * 更严重：该处 game.pause() 之后只在 oncomplete 里 game.resume()，
 * 一旦抛异常就再也不会 resume → 对局永久卡死。
 * 这里加判空 + 兜底 resume。
 * ============================================================ */
console.log('【补丁 8】Thunder · spine 判空（防止对局卡死）');
(function () {
  const rel = 'extension/Thunder/extension.js';
  const file = REL(rel);
  if (!fs.existsSync(file)) { console.log('  ✗ 文件不存在: ' + rel); failed++; return; }
  let t = fs.readFileSync(file, 'utf8');
  const rules = [
    {
      marker: '/*iOS-port*/ if (!faqi',
      re: /([ \t]*)faqi\.moveTo\(document\.body\.offsetWidth \* 0\.48, document\.body\.offsetHeight \* 0\.49, 400\);/,
      rep: "$1/*iOS-port*/ if (!faqi || typeof faqi.moveTo !== 'function') { game.resume(); return; }\n$1faqi.moveTo(document.body.offsetWidth * 0.48, document.body.offsetHeight * 0.49, 400);",
      note: '神宫 faqi 判空 + 兜底 resume',
    },
    {
      marker: '/*iOS-port*/ if (!event.bgSpine)',
      re: /([ \t]*)event\.bgSpine\.scaleTo\(0\.72, 490\);/,
      rep: "$1/*iOS-port*/ if (!event.bgSpine) { game.resume(); return; }\n$1event.bgSpine.scaleTo(0.72, 490);",
      note: '神宫 bgSpine 判空',
    },
    {
      marker: '/*iOS-port*/ if (shh &&',
      re: /([ \t]*)shh\.fadeTo\(1, 100\);/,
      rep: "$1/*iOS-port*/ if (shh && typeof shh.fadeTo === 'function') shh.fadeTo(1, 100);",
      note: '神宫 shh 判空',
    },
  ];
  let any = 0;
  for (const r of rules) {
    if (t.includes(r.marker)) { console.log(`  ○ 已打过: ${r.note}  [${rel}]`); skipped++; continue; }
    if (!r.re.test(t)) { console.log(`  ✗ 未找到目标: ${r.note}  [${rel}]`); failed++; continue; }
    t = t.replace(r.re, r.rep);
    console.log(`  ✓ 已应用: ${r.note}  [${rel}]`);
    applied++; any++;
  }
  if (any) { fs.writeFileSync(file, t, 'utf8'); }
}());

/* ============================================================
 * 补丁 6：十周年UI extension.js 里的同一处手牌布局判空
 * 与补丁 4 代码完全一致，是同一功能的两套实现（extension.js / meihua.js），
 * 因此两处都必须加保护。
 * ============================================================ */
console.log('【补丁 6】十周年UI · extension.js 手牌布局判空');
patch(
  'extension/十周年UI/extension.js',
  'ui.skillControl && ui.skillControl.node &&',
  'var pw = ui.skillControl.node.enable.childNodes.length > 2 ? 0.95 * bounds.width : 0.996 * bounds.width;',
  'var pw = (ui.skillControl && ui.skillControl.node && ui.skillControl.node.enable && ui.skillControl.node.enable.childNodes.length > 2) ? 0.95 * bounds.width : 0.996 * bounds.width;',
  '手牌布局判空（extension.js）'
);

/* ============================================================
 * 补丁 5：EpicFX 装备特效素材缺失处理
 * 代码要加载 extension/EpicFX/asset/img/sequenceFrame/equip1/
 * 下的序列帧，但该目录在本包中不存在 → 每次初始化约 500 次
 * 注定失败的图片请求 + 未处理 Promise 拒绝（刷屏并拖慢性能）。
 * 直接停用预加载，并预置空帧数组（playSequenceFrame 对空数组
 * 有保护，只会打一条 No Data 警告）。
 * ============================================================ */
console.log('【补丁 5】EpicFX · 停用缺失素材的预加载');
(function () {
  const rel = 'extension/EpicFX/extension.js';
  const file = REL(rel);
  if (!fs.existsSync(file)) { console.log('  ✗ 文件不存在: ' + rel); failed++; return; }
  let t = fs.readFileSync(file, 'utf8');
  if (t.includes('EpicFX equip1 preload SKIPPED')) {
    console.log('  ○ 已打过: EpicFX 预加载停用  [' + rel + ']');
    skipped++;
    return;
  }
  const startMark = 'EpicFX.animate.loadEquip1 = function () {';
  const callMark = 'EpicFX.animate.loadEquip1();';
  const s = t.indexOf(startMark);
  const c = t.indexOf(callMark);
  if (s < 0 || c < 0 || c < s) {
    console.log('  ✗ 未定位到 loadEquip1  [' + rel + ']');
    failed++;
    return;
  }
  const neu = [
    'EpicFX.animate.loadEquip1 = function () {',
    '          /* iOS port: assets "asset/img/sequenceFrame/equip1/" are not present in this package.',
    '             Skipping the preload avoids ~500 doomed image requests per init.',
    '             data is preset to [] so playAnimation() sees an empty frame list (playSequenceFrame guards it). */',
    '          Object.keys(EpicFX.animate.equip1).forEach(function (key) {',
    '            EpicFX.animate.equip1[key].data = [];',
    '          });',
    '          console.log("[iOS-port] EpicFX equip1 preload SKIPPED (assets missing)");',
    '        }',
    ''
  ].join('\n');
  t = t.slice(0, s) + neu + t.slice(c);
  // 顺带：preloadImages 失败时返回结构完整的空结果（通用兜底）
  if (!t.includes('return { key: data.key, images: [] }')) {
    const def = t.indexOf('preloadImages: function');
    if (def >= 0) {
      const ci = t.indexOf('.catch(', def);
      if (ci >= 0 && ci < def + 1500) {
        const e2 = t.indexOf('});', ci);
        if (e2 >= 0) {
          t = t.slice(0, ci) + '.catch(function () { return { key: data.key, images: [] }; })' + t.slice(e2 + 2);
        }
      }
    }
  }
  fs.writeFileSync(file, t, 'utf8');
  console.log('  ✓ 已应用: EpicFX 预加载停用 + preloadImages 兜底  [' + rel + ']');
  applied++;
}());

/* ============================================================
 * 可选清理：删除「如真似幻」扩展
 * 它是手杀风格的启动大厅，会劫持启动流程、强制本地"登录"，
 * 且在未登录时执行 document.body.remove() 直接删掉整个页面。
 * 在 iOS 上极易把游戏卡死。默认**不删**，加 --remove-lobby 才删。
 * ============================================================ */
if (process.argv.includes('--remove-lobby')) {
  console.log('【可选】删除「如真似幻」扩展');
  const dir = REL('extension/如真似幻');
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('  ✓ 已删除 extension/如真似幻');
    applied++;
  } else {
    console.log('  ○ 已不存在');
    skipped++;
  }
}

console.log('');
console.log(`完成：应用 ${applied} 项，跳过 ${skipped} 项（已存在），失败 ${failed} 项。`);
if (failed > 0) process.exit(1);
