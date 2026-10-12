/*
 * 无名杀 iPad 移植 —— 平台垫片 (Platform Shim)
 * ==================================================================
 * 目标：让「无名杀游戏本体」在 WKWebView / 浏览器里，以为自己在原生 App 内运行。
 *
 * 原理：游戏源码 game.js 里平台后端只有两套分支：
 *     if (lib.device)              -> Cordova 移动端后端 (Android / iOS 共用)
 *     else if (window.require)     -> Node / Electron 后端
 *   其中 lib.device 由 localStorage.noname_inited 是否已设置 + UA 判定。
 *
 *   我们提供 localStorage.noname_inited，并在 UA 命中 ipad 时启用 iOS 分支，
 *   然后由本垫片补齐该分支所需的全部原生 API：
 *
 *     window.resolveLocalFileSystemURL()   cordova-plugin-file
 *     window.FileTransfer                  cordova-plugin-file-transfer
 *     cordova.file.documentsDirectory
 *     window.StatusBar                     cordova-plugin-statusbar
 *     navigator.notification               cordova-plugin-dialogs
 *     navigator.app.exitApp
 *     window.jsBridge                      原 APK 的自定义原生桥
 *
 * 传输层（platform transport）可替换：
 *     - 桌面验证： window.__nonameInvoke 不存在 -> 走 HTTP /__bridge/*
 *     - iOS 端  ： 原生注入 window.__nonameInvoke(method, args) -> Promise
 *   除传输层外，本文件在两端完全一致。
 */
(function () {
  'use strict';

  if (window.__NONAME_SHIM__) return;
  window.__NONAME_SHIM__ = true;

  var VERSION = '0.1.0';
  var qs = new URLSearchParams(location.search || '');

  /* ------------------------------------------------------------------
   * 1) 强制 iOS 代码路径（仅桌面验证用；iOS 真机无需，UA 天然命中 ipad）
   * ------------------------------------------------------------------ */
  if (qs.get('force') === 'ios' || window.__NONAME_FORCE_IOS__) {
    try {
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        get: function () {
          return 'Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) AppleWebKit/605.1.15 ' +
                 '(KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1';
        }
      });
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------
   * 2) 游戏根路径 = lib.assetURL
   * ------------------------------------------------------------------ */
  var ROOT = (function () {
    if (qs.get('root')) return decodeURIComponent(qs.get('root'));
    var base = location.origin + location.pathname.replace(/[^/]*$/, '');
    return base.replace(/\/+$/, '') + '/';
  })();

  /* ------------------------------------------------------------------
   * 3) 传输层
   * ------------------------------------------------------------------ */
  function httpInvoke(method, args) {
    return fetch('/__bridge/' + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.text().then(function (txt) {
        var j = {};
        try { j = txt ? JSON.parse(txt) : {}; } catch (e) { throw new Error('bridge bad response: ' + txt.slice(0, 200)); }
        if (!r.ok || j.error) throw new Error(j.error || ('bridge HTTP ' + r.status));
        return j;
      });
    });
  }

  function invoke(method, args) {
    if (typeof window.__nonameInvoke === 'function') {
      return Promise.resolve(window.__nonameInvoke(method, args || {}));
    }
    return httpInvoke(method, args);
  }

  function noop() {}

  /* ------------------------------------------------------------------
   * 3.5) 首启看门狗
   *   游戏 lib.init.init() 会设置：
   *       window.resetGameTimeout = setTimeout(lib.init.reset, loadtime || 5000)
   *   若 loadtime 内初始化未完成，就弹「游戏未正常载入」。
   *   移动端首次启动需要加载大量角色/卡牌/模式脚本，容易超过默认 5 秒，
   *   这里把默认等待时间放宽（不改变游戏逻辑，只放宽容错窗口）。
   * ------------------------------------------------------------------ */
  try {
    var LT_KEY = 'noname_0.9_loadtime';
    var cur = parseInt(localStorage.getItem(LT_KEY), 10);
    if (!cur || cur < 30000) localStorage.setItem(LT_KEY, '60000');
  } catch (e) { /* localStorage 不可用时忽略 */ }

  /* ------------------------------------------------------------------
   * 4) URL <-> 相对路径
   * ------------------------------------------------------------------ */
  function toRel(url) {
    var s = String(url == null ? '' : url);
    if (s.indexOf(ROOT) === 0) return s.slice(ROOT.length);
    // 兼容 file:/// 或带 query 的情况
    try {
      var u = new URL(s, ROOT);
      if (u.origin === location.origin) {
        var p = u.pathname.replace(/^\/+/, '');
        return decodeURIComponent(p);
      }
    } catch (e) { /* ignore */ }
    return s.replace(/^[a-zA-Z]+:\/\/[^/]*\//, '').replace(/^\/+/, '');
  }

  function joinRel() {
    var parts = [];
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      if (a == null || a === '') continue;
      parts.push(String(a));
    }
    return parts.join('/').replace(/\/{2,}/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  }

  function ab2b64(buf) {
    var bytes = new Uint8Array(buf);
    var chunk = 0x8000, out = [];
    for (var i = 0; i < bytes.length; i += chunk) {
      out.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
    }
    return btoa(out.join(''));
  }

  /* ------------------------------------------------------------------
   * 5) cordova-plugin-file 的最小兼容实现
   *    游戏只用到了：resolveLocalFileSystemURL / getFile / getDirectory /
   *    createReader.readEntries / remove / file() / createWriter().write()
   * ------------------------------------------------------------------ */

  function makeFileEntry(rel) {
    var entry = {
      isFile: true,
      isDirectory: false,
      name: rel.split('/').filter(Boolean).pop() || '',
      fullPath: '/' + rel,
      nativeURL: ROOT + rel
    };
    entry.toURL = function () { return ROOT + rel; };
    entry.toInternalURL = entry.toURL;
    entry.file = function (success, error) {
      fetch(ROOT + rel).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.blob();
      }).then(function (blob) {
        try {
          success(new File([blob], entry.name, { type: blob.type || 'application/octet-stream' }));
        } catch (e) {
          success(blob); // 老引擎没有 File 构造器时退化为 Blob
        }
      }, function (e) { error && error(e); });
    };
    entry.createWriter = function (success, error) {
      var writer = {
        position: 0,
        onwriteend: null,
        onerror: null,
        onwritestart: null,
        onprogress: null,
        onabort: null,
        write: function (data) {
          var p;
          try {
            if (typeof data === 'string') {
              p = invoke('writeFile', { p: rel, text: data });
            } else if (data instanceof ArrayBuffer) {
              p = invoke('writeFile', { p: rel, base64: ab2b64(data) });
            } else if (data && data.buffer instanceof ArrayBuffer) {
              p = invoke('writeFile', { p: rel, base64: ab2b64(data.buffer) });
            } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
              p = data.arrayBuffer().then(function (b) {
                return invoke('writeFile', { p: rel, base64: ab2b64(b) });
              });
            } else {
              p = invoke('writeFile', { p: rel, text: String(data) });
            }
          } catch (e) { error && error(e); return; }
          p.then(function () { writer.onwriteend && writer.onwriteend(); },
                 function (e) { writer.onerror && writer.onerror(e); });
        },
        truncate: function (len) {
          invoke('writeFile', { p: rel, text: '' }).then(function () {
            writer.onwriteend && writer.onwriteend();
          });
        },
        seek: function (offset) { writer.position = offset; },
        abort: noop
      };
      success(writer);
    };
    entry.remove = function (success, error) {
      invoke('remove', { p: rel }).then(function () { success && success(); }, function (e) { error && error(e); });
    };
    entry.copyTo = entry.moveTo = function (a, b, c) { (c || b || noop)(); };
    entry.getMetadata = function (success) { invoke('stat', { p: rel }).then(success, noop); };
    entry.setMetadata = function (a, b) { (b || a || noop)(); };
    return entry;
  }

  function makeDirEntry(rel) {
    var entry = {
      isFile: false,
      isDirectory: true,
      name: rel.split('/').filter(Boolean).pop() || '',
      fullPath: '/' + rel,
      nativeURL: ROOT + rel
    };
    entry.toURL = function () { return ROOT + rel; };
    entry.toInternalURL = entry.toURL;

    entry.getFile = function (name, flags, success, error) {
      if (typeof flags === 'function') { error = success; success = flags; }
      makeFileEntry(joinRel(rel, name)).file(
        function () { success(makeFileEntry(joinRel(rel, name))); },
        function () {
          if (flags && flags.create) {
            var target = joinRel(rel, name);
            invoke('writeFile', { p: target, base64: '' }).then(function () {
              success(makeFileEntry(target));
            }, function (e) { error && error(e); });
          } else {
            error && error({ code: 1 });
          }
        }
      );
    };

    entry.getDirectory = function (name, flags, success, error) {
      if (typeof flags === 'function') { error = success; success = flags; }
      var target = joinRel(rel, name);
      invoke('stat', { p: target }).then(function (st) {
        if (st.exists && st.isDirectory) return success(makeDirEntry(target));
        if (flags && flags.create) {
          return invoke('mkdir', { p: target }).then(function () { success(makeDirEntry(target)); });
        }
        throw new Error('dir not found');
      }).catch(function () {
        if (flags && flags.create) {
          invoke('mkdir', { p: target }).then(function () { success(makeDirEntry(target)); }, function (e) { error && error(e); });
        } else {
          error && error({ code: 1 });
        }
      });
    };

    entry.createReader = function () {
      var drained = false;
      return {
        readEntries: function (success, error) {
          if (drained) return success([]);
          drained = true;
          invoke('list', { p: rel }).then(function (r) {
            var out = [];
            (r.folders || []).forEach(function (n) { out.push(makeDirEntry(joinRel(rel, n))); });
            (r.files || []).forEach(function (n) { out.push(makeFileEntry(joinRel(rel, n))); });
            success(out);
          }, function (e) { error ? error(e) : success([]); });
        }
      };
    };

    entry.removeRecursively = function (success, error) {
      invoke('remove', { p: rel }).then(function () { success && success(); }, function (e) { error && error(e); });
    };
    entry.remove = entry.removeRecursively;
    entry.getMetadata = function (success) { invoke('stat', { p: rel }).then(success, noop); };
    return entry;
  }

  function resolveLocalFileSystemURL(url, success, error) {
    var rel = toRel(url);
    var done = function (st) {
      if (!st || !st.exists) { error && error({ code: 1, message: 'NOT_FOUND_ERR: ' + rel }); return; }
      success(st.isDirectory ? makeDirEntry(rel) : makeFileEntry(rel));
    };
    invoke('stat', { p: rel }).then(done, function (e) { error && error(e); });
  }

  window.resolveLocalFileSystemURL = resolveLocalFileSystemURL;
  window.resolveLocalFileSystemURI = resolveLocalFileSystemURL;

  /* ------------------------------------------------------------------
   * 6) FileTransfer（下载扩展 / 更新）
   * ------------------------------------------------------------------ */
  function FileTransfer() {
    this.onprogress = null;
    var self = this;
    this.download = function (source, target, success, error, trustAllHosts, options) {
      var rel = toRel(target);
      invoke('download', { url: String(source), p: rel }).then(function (r) {
        if (self.onprogress) {
          try { self.onprogress({ lengthComputable: true, loaded: r.size || 0, total: r.size || 0 }); } catch (e) {}
        }
        success(makeFileEntry(rel));
      }, function (e) {
        error && error({ code: 1, source: source, target: target, http_status: 0, body: String(e && e.message || e) });
      });
    };
    this.upload = function (source, target, success, error) { error && error({ code: 1 }); };
    this.abort = noop;
  }
  window.FileTransfer = FileTransfer;

  /* ------------------------------------------------------------------
   * 7) cordova 命名空间 / 插件桩
   * ------------------------------------------------------------------ */
  var cordova = window.cordova || {};
  cordova.file = {
    applicationDirectory: ROOT,
    applicationStorageDirectory: ROOT,
    dataDirectory: ROOT,
    cacheDirectory: ROOT + 'UserData/cache/',
    externalApplicationStorageDirectory: ROOT,
    externalDataDirectory: ROOT,       // Android 用的键；iOS 上同样映射到游戏根
    externalCacheDirectory: ROOT + 'UserData/cache/',
    externalRootDirectory: ROOT,
    documentsDirectory: ROOT,          // ★ iOS 使用的键
    syncedDataDirectory: ROOT,
    tempDirectory: ROOT + 'UserData/tmp/',
    bundle: ROOT
  };
  cordova.plugins = cordova.plugins || {};
  cordova.exec = function () { /* 无原生插件；全部走 __nonameInvoke */ };
  cordova.define = cordova.define || function (id, factory) { factory(null, {}, {}); };
  cordova.fireDocumentEvent = function (name, data) {
    try {
      var ev = document.createEvent('Event');
      ev.initEvent(name, true, true);
      if (data) for (var k in data) ev[k] = data[k];
      document.dispatchEvent(ev);
    } catch (e) {}
  };
  cordova.platformId = /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'browser';
  cordova.version = VERSION;
  window.cordova = cordova;

  /* StatusBar：真机由原生实现；此处降级为记录调用 */
  var statusBarCalls = [];
  window.StatusBar = {
    overlaysWebView: function (b) { statusBarCalls.push(['overlaysWebView', b]); },
    styleDefault: noop, styleLightContent: noop, styleBlackTranslucent: noop,
    styleBlackOpaque: noop, styleBlack: noop,
    backgroundColorByName: function (n) { statusBarCalls.push(['background', n]); },
    backgroundColorByHexString: function (h) { statusBarCalls.push(['background', h]); },
    hide: function () { statusBarCalls.push(['hide']); if (window.__nonameInvoke) invoke('statusBar', { show: false }); },
    show: function () { statusBarCalls.push(['show']); if (window.__nonameInvoke) invoke('statusBar', { show: true }); },
    isVisible: true, __calls: statusBarCalls
  };

  /* dialogs */
  navigator.notification = navigator.notification || {};
  navigator.notification.alert = function (message, callback, title, button) {
    window.alert((title ? title + '\n\n' : '') + message);
    if (callback) callback();
  };
  navigator.notification.confirm = function (message, callback, title, buttons) {
    var ok = window.confirm((title ? title + '\n\n' : '') + message);
    if (callback) callback(ok ? 1 : 2);
  };
  navigator.notification.prompt = function (message, callback, title, buttons, defaultText) {
    var v = window.prompt(message, defaultText);
    if (callback) callback(v == null ? { buttonIndex: 2 } : { buttonIndex: 1, input1: v });
  };
  navigator.notification.beep = noop;
  navigator.notification.vibrate = noop;

  /* app */
  navigator.app = navigator.app || {};
  navigator.app.exitApp = function () { if (window.__nonameInvoke) invoke('exitApp', {}); };
  navigator.app.overrideBackbutton = noop;

  /* 其它常见插件最小实现 */
  navigator.splashscreen = navigator.splashscreen || { show: noop, hide: noop };
  window.plugins = window.plugins || {};
  window.plugins.insomnia = window.plugins.insomnia || { keepAwake: noop, allowSleepAgain: noop };
  window.Media = window.Media || function (src, onSuccess, onError, onStatus) {
    var audio = new Audio(typeof src === 'string' ? src : (src && src.src) || '');
    var self = this;
    this.play = function () { audio.play(); onSuccess && onSuccess(); };
    this.pause = function () { audio.pause(); };
    this.stop = function () { audio.pause(); audio.currentTime = 0; };
    this.release = noop;
    this.seekTo = function (ms) { audio.currentTime = ms / 1000; };
    this.setVolume = function (v) { audio.volume = v; };
    this.getCurrentPosition = function (cb) { cb(audio.currentTime * 1000); };
    this.getDuration = function () { return isNaN(audio.duration) ? -1 : audio.duration * 1000; };
    this.startRecord = this.stopRecord = noop;
    this.__audio = audio;
    return this;
  };
  // 电池 / 网络等仅需存在
  if (!navigator.getBattery) noop();

  /* ------------------------------------------------------------------
   * 8) 自定义原生桥 window.jsBridge
   *    原 APK 里这是 Android 的 @JavascriptInterface 对象。
   *    这里把「命令」转发给原生传输层，「结果回调」则由原生侧调用
   *    window.app.* / window.jsBridge.onXxx。
   * ------------------------------------------------------------------ */
  var jsBridge = {
    // ---- 命令：JS -> 原生 ----
    getGamePath: function () { return ROOT; },
    setGamePath: function () { },
    importGameData: function () {
      invoke('importGameData', {}).then(function (r) {
        if (r && r.data && window.app && app.importData) {
          app.importData(r.data);
        } else {
          // 无存档可导入：直接告知完成，游戏走全新存档
          jsBridge.importDataFinish && jsBridge.importDataFinish();
        }
      }, function () {
        jsBridge.importDataFinish && jsBridge.importDataFinish();
      });
    },
    getExtensions: function () { invoke('getExtensions', {}).then(function (r) { jsBridge.onGetExtensions(r && r.value); }, noop); },
    enableExtension: function (name, enable) { invoke('enableExtension', { name: name, enable: !!enable }).then(noop, noop); },
    addExtension: function (name) { invoke('addExtension', { name: name }).then(noop, noop); },
    removeExtension: function (name) { invoke('removeExtension', { name: name }).then(noop, noop); },
    getExtensionState: function (name) { invoke('getExtensionState', { name: name }).then(function (r) { jsBridge.onExtensionStateGet(name, r && r.value); }, noop); },
    setNativeToJsBridgeMode: noop,
    jsSetNativeToJsBridgeMode: noop,
    jsBridgeCallback: noop,

    // ---- 结果通知：原生 -> JS（由原生侧调用；此处默认空实现，可被覆盖）----
    importDataFinish: noop,
    addMessage: function (m) { console.log('[noname] ' + m); },
    addErrorMessage: function (m) { console.error('[noname] ' + m); },
    onAddExtension: noop,
    onRemoveExtension: noop,
    onGetExtensions: noop,
    onEnableExtension: noop,
    onExtensionStateGet: noop,
    onImportDataFinish: noop
  };
  window.jsBridge = jsBridge;

  /* ------------------------------------------------------------------
   * 9) 暴露给调试
   * ------------------------------------------------------------------ */
  window.__noname = {
    version: VERSION,
    root: ROOT,
    invoke: invoke,
    makeDirEntry: makeDirEntry,
    makeFileEntry: makeFileEntry
  };

  console.log('[noname-shim] v' + VERSION + ' ready, ROOT=' + ROOT +
              ', transport=' + (window.__nonameInvoke ? 'native' : 'http'));
}());
