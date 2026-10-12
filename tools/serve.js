/*
 * 无名杀 iPad 移植 —— 桌面验证服务器
 * ------------------------------------------------------------------
 * 作用：在 Windows 上 1:1 模拟 iOS 端 WKWebView + 本地 HTTP 服务的运行环境，
 *       用来验证「游戏本体 + 平台垫片(shim)」这套组合是否完整可跑。
 *
 * 设计要点（与 iOS 端保持一致）：
 *   - 根路径 /            -> 返回「启动器壳」(shell)，不是游戏文件
 *   - /game /image /audio ... -> 静态返回游戏本体目录
 *   - /__bridge/*         -> 原生桥（文件读写/目录/下载/存档导入）
 *
 * iOS 端把这套 HTTP 换成本地 HTTP server + WKScriptMessageHandler，
 * 垫片 JS 代码可以几乎原样复用。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '8123', 10);
// 默认使用工程内的 payload/game（由 tools/prepare.ps1 生成）
const GAME_DIR = process.env.GAME_DIR || path.join(__dirname, '..', 'payload', 'game');

// --lan : 绑定 0.0.0.0，让同一局域网的平板/手机用浏览器直接玩（无需装 App）
const LAN = process.argv.includes('--lan');
const HOST = LAN ? '0.0.0.0' : '127.0.0.1';
const WWW_DIR = process.env.WWW_DIR || path.join(__dirname, '..', 'cordova', 'www');
const SHIM = path.join(__dirname, '..', 'shim', 'noname-cordova-shim.js');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.bmp': 'image/bmp',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.zip': 'application/zip', '.apk': 'application/vnd.android.package-archive',
};

function mime(p) { return MIME[path.extname(p).toLowerCase()] || 'application/octet-stream'; }

/* --------------------------- 访问日志 ---------------------------
 * --lan 模式下，每一条请求都会打印并追加写入 lan-access.log。
 * 用途：在平板上访问时，电脑这边能立刻看出「请求到底有没有到」。
 *   - 日志里出现来自平板 IP 的记录  → 网络通，问题在浏览器侧（例如用了 HTTPS）
 *   - 日志里什么都没有              → 网络没通（AP 隔离 / 防火墙 / 网段不对）
 */
const LOG_FILE = LAN ? path.join(__dirname, '..', 'lan-access.log') : null;
function accessLog(req) {
  const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const line = `${new Date().toISOString()}  ${ip.padEnd(15)}  ${req.method} ${req.url}`;
  console.log('  ' + line);
  if (LOG_FILE) { try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (e) { /* ignore */ } }
}

/** 防止 ../ 逃逸出游戏目录 */
function safeJoin(root, rel) {
  const norm = path.normalize(rel).replace(/^([/\\])+/, '');
  const full = path.join(root, norm);
  const rootResolved = path.resolve(root);
  if (path.resolve(full) !== rootResolved && !path.resolve(full).startsWith(rootResolved + path.sep)) {
    throw new Error('path escape: ' + rel);
  }
  return full;
}

/* ------------------------------ 原生桥实现 ------------------------------ */
/* 所有游戏文件操作都收敛到这里；iOS 端就是同一组语义，换成 Swift 实现。 */
const bridge = {
  async gamePath() {
    return { url: `http://127.0.0.1:${PORT}/` };
  },
  async stat({ p }) {
    const full = safeJoin(GAME_DIR, p);
    try {
      const st = await fsp.stat(full);
      return { exists: true, isDirectory: st.isDirectory(), isFile: st.isFile(), size: st.size, mtime: st.mtimeMs };
    } catch { return { exists: false }; }
  },
  async readFile({ p, encoding }) {
    const full = safeJoin(GAME_DIR, p);
    const buf = await fsp.readFile(full);
    if (encoding === 'utf-8' || encoding === 'utf8') return { text: buf.toString('utf8') };
    return { base64: buf.toString('base64') };
  },
  async writeFile({ p, base64, text }) {
    const full = safeJoin(GAME_DIR, p);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    const buf = typeof text === 'string' ? Buffer.from(text, 'utf8') : Buffer.from(base64 || '', 'base64');
    await fsp.writeFile(full, buf);
    return { ok: true, size: buf.length };
  },
  async list({ p }) {
    const full = safeJoin(GAME_DIR, p);
    let entries;
    try { entries = await fsp.readdir(full, { withFileTypes: true }); }
    catch { return { folders: [], files: [] }; }
    const folders = [], files = [];
    for (const e of entries) {
      if (e.name[0] === '.' || e.name[0] === '_') continue;
      if (e.isDirectory()) folders.push(e.name);
      else files.push(e.name);
    }
    folders.sort(); files.sort();
    return { folders, files };
  },
  async mkdir({ p }) {
    await fsp.mkdir(safeJoin(GAME_DIR, p), { recursive: true });
    return { ok: true };
  },
  async remove({ p }) {
    const full = safeJoin(GAME_DIR, p);
    await fsp.rm(full, { recursive: true, force: true });
    return { ok: true };
  },
  async download({ url, p, }) {
    const full = safeJoin(GAME_DIR, p);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    const res = await fetch(url, { headers: { 'User-Agent': 'AppleWebkit' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    const tmp = full + '.part';
    await fsp.writeFile(tmp, buf);
    await fsp.rename(tmp, full);
    return { ok: true, size: buf.length };
  },
  // 存档导入相关：桌面验证阶段先直接回「无数据」，由游戏走全新存档
  async importGameData() { return { hasData: false }; },
  async extensionAction({ action }) { return { ok: true, action }; },
};

/* ------------------------------- HTTP 服务 ------------------------------- */
function sendJSON(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
  res.end(body);
}

function serveFile(res, filePath, req) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found: ' + filePath);
    }
    const headers = { 'Content-Type': mime(filePath), 'Cache-Control': 'no-cache' };
    const type = mime(filePath);
    // 支持 Range（音频 seek 需要）
    const range = req.headers.range;
    if (range && /^(audio|video)\//.test(type)) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? parseInt(m[2], 10) : st.size - 1;
        if (start >= st.size || end >= st.size || start > end) {
          res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
          return res.end();
        }
        headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
        headers['Accept-Ranges'] = 'bytes';
        headers['Content-Length'] = end - start + 1;
        res.writeHead(206, headers);
        return fs.createReadStream(filePath, { start, end }).pipe(res);
      }
    }
    headers['Accept-Ranges'] = 'bytes';
    headers['Content-Length'] = st.size;
    // 大文件已在 APK 内为 stored(=未压缩)，无需 Content-Encoding
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = decodeURIComponent(u.pathname);
  accessLog(req);

  try {
    // ---- 连通性探针（平板侧最快验证方式）----
    if (pathname === '/__ping') {
      const body = Buffer.from('noname-lan-ok', 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length });
      return res.end(body);
    }

    // ---- 原生桥 ----
    if (pathname.startsWith('/__bridge/')) {
      const method = pathname.slice('/__bridge/'.length);
      if (!bridge[method]) return sendJSON(res, 404, { error: 'unknown bridge method: ' + method });
      let args = {};
      if (req.method === 'POST') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const raw = Buffer.concat(chunks).toString('utf8');
        args = raw ? JSON.parse(raw) : {};
      } else {
        args = Object.fromEntries(u.searchParams.entries());
      }
      try {
        const out = await bridge[method](args);
        return sendJSON(res, 200, out || { ok: true });
      } catch (e) {
        return sendJSON(res, 500, { error: String(e && e.message || e) });
      }
    }

    // ---- 启动器壳（挂在根路径，与 Android 端 assets/www 等价）----
    if (pathname === '/') {
      return serveFile(res, path.join(WWW_DIR, 'index.html'), req);
    }

    const rel = pathname.replace(/^\/+/, '');

    // ---- 垫片脚本（两端一致地挂在根名 __shim.js）----
    if (rel === '__shim.js') {
      return serveFile(res, SHIM, req);
    }

    // ---- 先查启动器壳目录（css/img/js/plugins 等）----
    const inWww = path.join(WWW_DIR, rel);
    if (inWww.startsWith(path.resolve(WWW_DIR)) && fs.existsSync(inWww) && fs.statSync(inWww).isFile()) {
      return serveFile(res, inWww, req);
    }

    // ---- 其余按游戏本体目录静态返回 ----
    return serveFile(res, safeJoin(GAME_DIR, rel), req);

  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 ' + String(e && e.message || e));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[noname-port] serving`);
  console.log(`  game   : ${GAME_DIR}`);
  console.log(`  shell  : ${WWW_DIR}`);
  if (!LAN) {
    console.log(`  url    : http://127.0.0.1:${PORT}/`);
  } else {
    const ips = [];
    for (const list of Object.values(require('os').networkInterfaces())) {
      for (const ni of list || []) {
        if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address);
      }
    }
    console.log('');
    console.log('  ============================================================');
    console.log('   局域网已开启：在 iPad 的 Safari 里打开下面任一地址即可游玩');
    console.log('');
    for (const ip of ips) console.log(`       http://${ip}:${PORT}/`);
    console.log('');
    console.log('   首次进不去就检查 Windows 防火墙是否放行了 Node。');
    console.log('  ============================================================');
  }
});
