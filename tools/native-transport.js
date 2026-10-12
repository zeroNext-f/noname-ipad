/*
 * 无名杀 iPad 移植 —— iOS 原生传输层 (Native Transport)
 * ==================================================================
 * 由 iOS 端通过 WKUserScript 在 documentStart 注入。
 * 作用：把平台垫片里的 invoke(method, args) 变成对原生的消息调用。
 *
 * 协议：
 *   JS  -> 原生 : window.webkit.messageHandlers.nonameNative.postMessage({id, method, args})
 *   原生 -> JS : window.__nonameNativeReply(id, resultJSON)
 *
 * 因为 WKScriptMessageHandler 的回执是异步且无 Promise 的，
 * 这里用 id + 回调表把异步结果转成 Promise。
 */
(function () {
  'use strict';
  if (window.__nonameInvoke) return;

  var pending = {};
  var seq = 0;

  window.__nonameNativeReply = function (id, resultJSON) {
    var cb = pending[id];
    if (!cb) return;
    delete pending[id];
    var value = resultJSON;
    if (typeof resultJSON === 'string') {
      try { value = JSON.parse(resultJSON); } catch (e) { value = { raw: resultJSON }; }
    }
    if (value && typeof value === 'object' && value.__error) {
      cb.reject(new Error(value.__error));
    } else {
      cb.resolve(value);
    }
  };

  window.__nonameNativeProgress = function (id, loaded, total) {
    var cb = pending[id];
    if (cb && cb.onprogress) cb.onprogress(loaded, total);
  };

  window.__nonameInvoke = function (method, args, onprogress) {
    return new Promise(function (resolve, reject) {
      var id = 'r' + (++seq);
      pending[id] = { resolve: resolve, reject: reject, onprogress: onprogress };
      try {
        window.webkit.messageHandlers.nonameNative.postMessage({
          id: id, method: method, args: args || {}
        });
      } catch (e) {
        delete pending[id];
        reject(e);
      }
    });
  };

  console.log('[native-transport] ready');
}());

/* ==================================================================
 * 调试日志桥
 * ------------------------------------------------------------------
 * 把 WebView 里的 console 输出 / 未捕获异常转发给原生，
 * 原生追加写入 App 的 Documents/noname-debug.log。
 * 这样出问题时可以用爱思助手把日志导出来，在电脑上直接看原因，
 * 不需要 Xcode / Safari 网页检查器。
 * ================================================================== */
(function () {
  'use strict';
  if (window.__NONAME_LOG_BRIDGE__) return;
  window.__NONAME_LOG_BRIDGE__ = true;
  if (typeof window.__nonameInvoke !== 'function') return;

  var buf = [];
  var MAX_BUF = 120;

  function flush() {
    if (!buf.length) return;
    var text = buf.join('\n');
    buf = [];
    try {
      window.__nonameInvoke('log', { text: text }).catch(function () {});
    } catch (e) { /* 忽略 */ }
  }

  function fmt(a) {
    try {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.stack || (a.name + ': ' + a.message);
      return JSON.stringify(a);
    } catch (e) {
      try { return String(a); } catch (e2) { return '?'; }
    }
  }

  function wrap(level, orig) {
    return function () {
      try {
        var parts = [];
        for (var i = 0; i < arguments.length; i++) parts.push(fmt(arguments[i]));
        buf.push('[' + level + '] ' + parts.join(' '));
        if (buf.length >= MAX_BUF) flush();
      } catch (e) { /* 绝不因为日志本身出错 */ }
      try { return orig.apply(console, arguments); } catch (e) {}
    };
  }

  console.log   = wrap('log',   console.log.bind(console));
  console.warn  = wrap('warn',  console.warn.bind(console));
  console.error = wrap('error', console.error.bind(console));
  console.info  = wrap('info',  console.info.bind(console));

  window.addEventListener('error', function (e) {
    try {
      buf.push('[window.onerror] ' + (e.message || '') +
               ' @ ' + (e.filename || '?') + ':' + (e.lineno || '?') + ':' + (e.colno || '?'));
      if (e.error && e.error.stack) buf.push('[stack] ' + e.error.stack);
      flush();
    } catch (x) {}
  });

  window.addEventListener('unhandledrejection', function (e) {
    try {
      var r = e.reason;
      buf.push('[unhandledrejection] ' + fmt(r));
      if (r && r.stack) buf.push('[stack] ' + r.stack);
      flush();
    } catch (x) {}
  });

  setInterval(flush, 1000);
  window.addEventListener('pagehide', flush);
  flush();
}());
