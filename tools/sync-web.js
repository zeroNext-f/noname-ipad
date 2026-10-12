/*
 * 同步 Web 壳到 iOS 工程资源目录
 * ------------------------------------------------------------
 * 单一来源：
 *   cordova/www/            <- 原 APK 的 assets/www（启动器壳）
 *   shim/noname-cordova-shim.js
 * 目标：
 *   ios/NonameDecade/Resources/Web/
 * 这样桌面验证与 iOS 端跑的是同一份壳代码。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_WWW = path.join(ROOT, 'cordova', 'www');
const SRC_SHIM = path.join(ROOT, 'shim', 'noname-cordova-shim.js');
const DST = path.join(ROOT, 'ios', 'NonameDecade', 'Web');

function rmrf(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

rmrf(DST);
copyDir(SRC_WWW, DST);
fs.copyFileSync(SRC_SHIM, path.join(DST, '__shim.js'));
// 原生传输层（iOS 端由 WKWebView 注入 __nonameInvoke，桌面端不需要）
const nativeTransport = path.join(__dirname, 'native-transport.js');
if (fs.existsSync(nativeTransport)) fs.copyFileSync(nativeTransport, path.join(DST, '__native.js'));

let n = 0, bytes = 0;
(function walk(p) {
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const f = path.join(p, e.name);
    if (e.isDirectory()) walk(f); else { n++; bytes += fs.statSync(f).size; }
  }
})(DST);

console.log(`synced ${n} files (${(bytes / 1024).toFixed(1)} KB) -> ${DST}`);
