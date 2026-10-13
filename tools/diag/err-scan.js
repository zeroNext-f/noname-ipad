const fs = require('fs');
const LF = 'C:/Users/ASUS/AppData/Local/Temp/noname-debug.log';
const OUT = 'C:/Users/ASUS/AppData/Local/Temp/opencode/err-scan.txt';

const raw = fs.readFileSync(LF, 'utf8');
const lines = raw.split(/\r?\n/);
const boots = [];
lines.forEach((l, i) => { if (/noname-shim.*ready/.test(l)) boots.push(i); });

function norm(l) {
  let s = l.replace(/^\[\d\d:\d\d:\d\d\.\d+\]\s*/, '');
  s = s.replace(/https?:\/\/127\.0\.0\.1:\d+\//g, '<URL>/');
  s = s.replace(/(%[0-9A-Fa-f]{2})+/g, '<CN>');
  s = s.replace(/\d+/g, 'N');
  return s.trim();
}

function scan(from, to) {
  const map = new Map();
  const order = [];
  for (let i = from; i < to; i++) {
    const l = lines[i];
    if (!/\[error\]|\[window\.onerror\]|\[unhandledrejection\]/.test(l)) continue;
    const n = norm(l);
    if (!map.has(n)) { map.set(n, { count: 0, sample: l.trim() }); order.push(n); }
    map.get(n).count++;
  }
  return { map, order };
}

function report(title, from, to) {
  const { map, order } = scan(from, to);
  const out = [];
  out.push('');
  out.push('===== ' + title + ' =====');
  out.push('  去重后种类数: ' + order.length);
  let total = 0;
  map.forEach(v => total += v.count);
  out.push('  报错总行数: ' + total);
  out.push('');
  const sorted = order.slice().sort((a, b) => map.get(b).count - map.get(a).count);
  sorted.forEach((n, idx) => {
    const v = map.get(n);
    const isSkin = /dynamicSkin|dynamic\.js|Skin/i.test(n);
    out.push('  #' + (idx + 1) + '  x' + v.count + (isSkin ? '   [★动态皮肤相关]' : ''));
    out.push('       样本: ' + v.sample.slice(0, 150));
    if (v.sample !== n) out.push('       归一: ' + n.slice(0, 150));
  });
  return out.join('\n');
}

const parts = [];
parts.push('日志: ' + LF);
parts.push('总行数: ' + lines.length);
parts.push('启动次数: ' + boots.length);

if (boots.length) {
  const lastB = boots[boots.length - 1];
  parts.push(report('最后一次启动之后 (第 ' + (lastB + 1) + ' 行起)', lastB, lines.length));
  if (boots.length >= 2) {
    const prev = boots[boots.length - 2];
    parts.push(report('最后两次启动合计 (第 ' + (prev + 1) + ' 行起)', prev, lines.length));
  }
}

// 只看最近的 22:20 之后的会话
let cut = -1;
for (let i = lines.length - 1; i >= 0; i--) { if (/\[22:20:5/.test(lines[i])) { cut = i; break; } }
if (cut > 0) parts.push(report('22:20 之后到现在', cut, lines.length));

parts.push(report('整个日志 (历史累计，含已修好的旧问题)', 0, lines.length));

fs.writeFileSync(OUT, parts.join('\n'), 'utf8');
console.log('OK -> ' + OUT);
