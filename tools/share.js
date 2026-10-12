/*
 * 无名杀 iPad 移植 —— 局域网游戏数据分发服务
 * ==================================================================
 * 在电脑上运行本脚本，iPad 上的 App 会把游戏目录「逐文件镜像」到自己的沙盒。
 * 相比传一个 2.5GB 的压缩包，这种方式：
 *   - 可断点续传（按 路径+大小 比对，已存在则跳过）
 *   - 可显示进度
 *   - 无需设备端解压（iOS 没有内置 zip 解压 API）
 *
 * 用法：
 *   node tools/share.js                 # 默认分发 E:\noname-port\app\game
 *   node tools/share.js --dir "D:\path\to\game"
 *   node tools/share.js --port 8124
 *
 * App 侧协议：
 *   GET /__manifest   -> { version, dirs:[...], files:[{p,size}] }
 *   GET /<相对路径>    -> 文件内容
 */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const PORT = parseInt(arg('port', '8124'), 10);
// 默认使用工程内的 payload/game（由 tools/prepare.ps1 生成）
const DIR = path.resolve(arg('dir', path.join(__dirname, '..', 'payload', 'game')));

if (!fs.existsSync(DIR)) {
  console.error(`找不到游戏目录：${DIR}`);
  console.error('请用 --dir 指定无名杀游戏根目录（应包含 game/game.js）。');
  process.exit(1);
}
if (!fs.existsSync(path.join(DIR, 'game', 'game.js'))) {
  console.error(`警告：${DIR} 下没有 game/game.js，可能不是游戏根目录。`);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};
const mime = (p) => MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';

function safeJoin(rel) {
  const norm = path.normalize(rel).replace(/^([/\\])+/, '');
  const full = path.join(DIR, norm);
  const root = path.resolve(DIR);
  if (path.resolve(full) !== root && !path.resolve(full).startsWith(root + path.sep)) {
    throw new Error('path escape: ' + rel);
  }
  return full;
}

/* ---------------- 清单构建（启动时一次性扫描） ---------------- */
async function buildManifest() {
  const files = [];
  const dirs = [];
  const walked = new Set([DIR]);

  async function walk(dir) {
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        dirs.push(path.relative(DIR, full).replace(/\\/g, '/'));
        walked.add(full);
        await walk(full);
      } else if (e.isFile()) {
        let st;
        try { st = await fsp.stat(full); } catch { continue; }
        files.push({ p: path.relative(DIR, full).replace(/\\/g, '/'), size: st.size });
      }
    }
  }

  await walk(DIR);
  files.sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : 0));
  return { version: 'noname-decade-1.12.7', dirs, files };
}

function sendJSON(res, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendFile(res, full, req) {
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404');
    }
    const headers = {
      'Content-Type': mime(full),
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(full).pipe(res);
  });
}

(async function main() {
  process.stdout.write('正在扫描游戏目录…\n');
  const t0 = Date.now();
  const manifest = await buildManifest();
  const totalBytes = manifest.files.reduce((s, f) => s + f.size, 0);
  process.stdout.write(
    `扫描完成：${manifest.files.length} 个文件 / ${(totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB` +
    `（${((Date.now() - t0) / 1000).toFixed(1)}s）\n`
  );

  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
      if (pathname === '/__manifest' || pathname === '/__manifest.json') {
        return sendJSON(res, manifest);
      }
      if (pathname === '/__ping') {
        return sendJSON(res, { ok: true, files: manifest.files.length, version: manifest.version });
      }
      const rel = pathname.replace(/^\/+/, '');
      if (!rel) {
        return sendJSON(res, { name: 'noname-share', files: manifest.files.length });
      }
      return sendFile(res, safeJoin(rel), req);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('500 ' + String(e && e.message || e));
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    const ips = [];
    for (const list of Object.values(os.networkInterfaces())) {
      for (const ni of list || []) {
        if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address);
      }
    }
    const line = '='.repeat(58);
    process.stdout.write(`\n${line}\n`);
    process.stdout.write('  请在 iPad 上的「无名杀十周年版」里填入下面任一地址：\n\n');
    if (ips.length === 0) {
      process.stdout.write('  (未检测到局域网 IP，请确认已连接 Wi-Fi)\n');
    } else {
      for (const ip of ips) process.stdout.write(`      http://${ip}:${PORT}/\n`);
    }
    process.stdout.write('\n  按 Ctrl+C 结束分发。\n');
    process.stdout.write(`${line}\n`);
  });
})();
