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
 * 补丁 9：game.js · sortCard() 判空
 * 原代码 game.sortCard 第一行直接读 game.me.buff.forbidSort，
 * 但 game.me 有可能还没挂上 buff 对象 → TypeError →
 * 本次「整理手牌」整个中断（表现为手牌不整理 / 位置异常）。
 * 实测日志：game.js:33271  TypeError: game.me.buff.forbidSort
 * ============================================================ */
console.log('【补丁 9】game.js · sortCard 判空');
patch(
  'game/game.js',
  'game.me && game.me.buff && game.me.buff.forbidSort',
  'if (arguments[0] != true && game.me.buff.forbidSort) return;',
  'if (arguments[0] != true && game.me && game.me.buff && game.me.buff.forbidSort) return; /* patched by iOS port */',
  'sortCard 判空'
);

/* ============================================================
 * 补丁 10：十周年UI 的 jiubuff.atlas 残缺 → 用「标记补充」的完整版覆盖
 *
 * 现象：对局中反复报
 *   Region not found in atlas: images/xulie_* / images/hongzhehzao_* / images/hongkuang_*
 *
 * 原因：十周年UI 自带的 assets/animation/jiubuff.atlas 只有 171 字节、
 *   仅 1 个 region（jiu）；而同一目录的 jiubuff.skel（与「标记补充」那份
 *   完全相同）引用了 25 个 images/* region —— 那些只有「标记补充」的
 *   atlas（2958 字节）才提供。即：骨骼来自 A，图集却要 B 的。
 *
 * 处理：把「标记补充」的完整 atlas 覆盖过来。
 *   （jiubuff.png / jiubuff2.png 两边本就完全相同，无需改动。）
 * ============================================================ */
console.log('【补丁 10】十周年UI · jiubuff.atlas 补全（来自标记补充）');
(function () {
  const srcRel = 'extension/标记补充/animation/jiubuff.atlas';
  const dstRel = 'extension/十周年UI/assets/animation/jiubuff.atlas';
  const src = REL(srcRel);
  const dst = REL(dstRel);
  if (!fs.existsSync(dst)) { console.log(`  ✗ 文件不存在: ${dstRel}`); failed++; return; }
  if (!fs.existsSync(src)) { console.log(`  ✗ 源文件不存在: ${srcRel}（需要完整的懒人包）`); failed++; return; }
  const cur = fs.readFileSync(dst, 'utf8');
  if (cur.includes('xulie')) { console.log(`  ○ 已打过: jiubuff.atlas 补全  [${dstRel}]`); skipped++; return; }
  if (cur.length > 2000) { console.log(`  ○ 已打过（体积已正常）: [${dstRel}]`); skipped++; return; }
  fs.copyFileSync(src, dst);
  // Windows 的 CopyFile 会保留源文件的修改时间，导致"按修改日期找补丁文件"
  // 这套识别办法失效 —— 这里强制把时间戳改成当前时间。
  try { const now = new Date(); fs.utimesSync(dst, now, now); } catch (e) {}
  console.log(`  ✓ 已应用: jiubuff.atlas 补全（${cur.length} → ${fs.statSync(dst).size} 字节）  [${dstRel}]`);
  applied++;
}());

/* ============================================================
 * 补丁 11：十周年UI · BoundsCache 在元素未就绪时错误地标记"已更新"
 *
 * 现象：手牌概率性向下偏移、武将正常、**不报任何错**、重开/换模式都可能触发。
 *
 * 原因：BoundsCache.update() 里
 *        var element = this.element;
 *        this.updated = true;               // ← 先标记已更新
 *        if (element === undefined) return; // ← 再发现元素没建好，直接返回
 *        this._x = element.offsetLeft; ...
 *   于是 this._x / this._y 永远是 undefined → 参与布局运算变 NaN →
 *   CSS 收到 "NaNpx" 是非法值被忽略 → 元素退回默认位置（向下偏移）。
 *   而 check() 见 updated===true 就再也不重算 → 整局都错。
 *   是否踩中取决于"首次测量时 ui.me / ui.handcards1 建好了没有" →
 *   所以表现为概率性、无报错。
 *
 * 修法：元素未就绪时保持 updated = false（并把 updateBefore 里那种
 *   "提前 return" 改成把 element 置空），等元素就绪后自动重算。
 * ============================================================ */
console.log('【补丁 11】十周年UI · BoundsCache 未就绪时重试（修手牌概率性下移）');
(function () {
  const rel = 'extension/十周年UI/extension.js';
  const file = REL(rel);
  if (!fs.existsSync(file)) { console.log('  ✗ 文件不存在: ' + rel); failed++; return; }

  // 幂等性单独判断（三种替换互相独立）
  let t = fs.readFileSync(file, 'utf8');
  const already = t.includes('/* iOS-port bounds-retry */');
  if (already) { console.log(`  ○ 已打过: BoundsCache 重试  [${rel}]`); skipped++; return; }

  const rules = [
    {
      // 核心：不要先标记 updated
      re: /this\.updated = true;(\s*)if \(element === undefined\) return;/,
      rep: "/* iOS-port bounds-retry */ if (element === undefined) { this.updated = false; return; }$1this.updated = true;",
      note: 'update(): 元素未就绪时不标记 updated',
    },
    {
      // hand 缓存：ui.handcards1 未就绪时把 element 置空，让 update() 走上面的分支
      re: /if \(ui\.handcards1 === undefined\)(\s*)return;/,
      rep: 'if (ui.handcards1 === undefined) { this.element = undefined; return; }',
      note: 'hand 缓存: handcards1 未就绪时重试',
    },
    {
      // arena 缓存：同理
      re: /if \(ui\.arena === undefined\)(\s*)return;/,
      rep: 'if (ui.arena === undefined) { this.element = undefined; return; }',
      note: 'arena 缓存: arena 未就绪时重试',
    },
  ];

  let n = 0;
  for (const r of rules) {
    const m = t.match(new RegExp(r.re.source, 'g'));
    if (!m) { console.log(`  ✗ 未找到目标: ${r.note}  [${rel}]`); failed++; continue; }
    if (m.length > 1) { console.log(`  ✗ 目标不唯一(${m.length}处): ${r.note}  [${rel}]`); failed++; continue; }
    t = t.replace(r.re, r.rep);
    console.log(`  ✓ 已应用: ${r.note}`);
    n++;
  }
  if (n > 0) { fs.writeFileSync(file, t, 'utf8'); applied++; }
}());

/* ============================================================
 * 补丁 12：十周年UI · 砍掉"开机预加载 46 个骨骼"（内存炸弹）
 *
 * 现象：对局打几分钟后"闪退回大厅"（App 不退出）、只有短局能打完、
 *       重载前**没有任何报错**。
 *
 * 原因：animationlist.js 里的 dcdanimation_list 会被 animation.js
 *   顺序预加载并常驻内存（animation.js:1593 的 read() 链）。
 *   实测这 46 个骨骼的贴图**解码后合计约 709 MB**
 *   （仅 SS_ShiWeiYanSkill 一个就 306.7 MB）。
 *   iPad 6 只有 2 GB 内存 → WebView 内容进程被 iOS 杀掉
 *   → 页面自动重载 → 表现为"闪退回大厅"。
 *
 * 修法：
 *   A) 清空预加载列表（animationlist.js）
 *   B) 让 playSpine 在骨骼未加载时**按需加载 + 加载完成后自动重播**
 *      （否则 playSpine 只会打印"骨骼没有加载"然后放弃，动画就没了）
 *   这样动画依然能用，但内存只占"本局实际用到"的那几个。
 * ============================================================ */
console.log('【补丁 12】十周年UI · 取消 46 个骨骼的开机预加载（省约 700MB 内存）');
(function () {
  // --- A) 清空预加载列表 ---
  const relA = 'extension/十周年UI/animationlist.js';
  const fileA = REL(relA);
  if (!fs.existsSync(fileA)) { console.log('  ✗ 文件不存在: ' + relA); failed++; }
  else {
    let t = fs.readFileSync(fileA, 'utf8');
    if (t.includes('iOS-port: 清空预加载')) { console.log(`  ○ 已打过: 预加载列表清空  [${relA}]`); skipped++; }
    else {
      const re = /window\.dcdanimation_list\s*=\s*\[[\s\S]*?\];/;
      if (!re.test(t)) { console.log(`  ✗ 未找到目标: 预加载列表  [${relA}]`); failed++; }
      else {
        t = t.replace(re, 'window.dcdanimation_list=[]; /* iOS-port: 清空预加载（原 46 个骨骼解码后约 709MB，改为按需加载）*/');
        fs.writeFileSync(fileA, t, 'utf8');
        const now = new Date(); try { fs.utimesSync(fileA, now, now); } catch (e) {}
        console.log(`  ✓ 已应用: 预加载列表清空  [${relA}]`);
        applied++;
      }
    }
  }

  // --- B) playSpine 按需加载 + 自动重播 ---
  const relB = 'extension/十周年UI/animation.js';
  const fileB = REL(relB);
  if (!fs.existsSync(fileB)) { console.log('  ✗ 文件不存在: ' + relB); failed++; return; }
  let t = fs.readFileSync(fileB, 'utf8');
  if (t.includes('iOS-port lazy-spine')) { console.log(`  ○ 已打过: playSpine 按需加载  [${relB}]`); skipped++; return; }
  const reB = /if \(!this\.hasSpine\(sprite\.name\)\) return console\.error\('playSpine: \[' \+ sprite\.name \+ '\] 骨骼没有加载'\);/;
  if (!reB.test(t)) { console.log(`  ✗ 未找到目标: playSpine  [${relB}]`); failed++; return; }
  const repB = [
    'if (!this.hasSpine(sprite.name)) {',
    '/* iOS-port lazy-spine: 骨骼没预加载时按需加载，成功后自动重播 */',
    'var _iosA = this, _iosArgs = arguments;',
    'if (!_iosA.__iosLoading) _iosA.__iosLoading = {};',
    'if (_iosA.__iosLoading[sprite.name]) return;',
    '_iosA.__iosLoading[sprite.name] = true;',
    'var _iosType = sprite.fileType || \'skel\';',
    '_iosA.loadSpine(sprite.name, _iosType, function () {',
    'delete _iosA.__iosLoading[sprite.name];',
    '_iosA.prepSpine(sprite.name);',
    '_iosA.playSpine.apply(_iosA, _iosArgs);',
    '}, function () {',
    'delete _iosA.__iosLoading[sprite.name];',
    'console.error(\'playSpine: [\' + sprite.name + \'] 骨骼没有加载\');',
    '});',
    'return;',
    '}',
  ].join('\n\t\t\t');
  t = t.replace(reB, repB);
  fs.writeFileSync(fileB, t, 'utf8');
  const now = new Date(); try { fs.utimesSync(fileB, now, now); } catch (e) {}
  console.log(`  ✓ 已应用: playSpine 按需加载 + 自动重播  [${relB}]`);
  applied++;
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
