/*
 * 无名杀 iPad 移植 —— cordova.js 兼容桩 (Compatibility Stub)
 * ==================================================================
 * 背景：
 *   游戏 game.js 在 app 模式下（lib.device 为 android/ios）会执行：
 *       var script = document.createElement('script');
 *       script.src = 'cordova.js';
 *       document.body.appendChild(script);
 *       document.addEventListener('deviceready', function () {
 *           lib.init.cordovaReady();
 *       });
 *   也就是说它期望运行在真正的 Cordova 原生容器里。
 *
 * 在 WKWebView（无 Cordova 原生层）环境下，用本文件顶替官方 cordova.js：
 *   1. 保证 window.cordova 存在（由平台垫片 __shim.js 提供，缺失则补最小实现）
 *   2. 提供 cordova.exec / cordova.require 等最小接口
 *   3. 触发 deviceready 事件，让游戏继续初始化
 *
 * 注意：真正的原生能力（文件读写/下载/jsBridge）全部由 __shim.js +
 *       原生传输层 __nonameInvoke 提供，本文件不重复实现。
 */
(function () {
  'use strict';

  if (window.__NONAME_CORDOVA_STUB__) return;
  window.__NONAME_CORDOVA_STUB__ = true;

  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  /* ---- 1. 确保 cordova 命名空间存在 ---- */
  var cordova = window.cordova;
  if (!cordova) {
    cordova = window.cordova = {};
  }

  if (!cordova.exec) {
    cordova.exec = function (success, fail, service, action, args) {
      var invoke = window.__nonameInvoke;
      if (typeof invoke !== 'function') {
        // 无原生层：不阻断游戏，回调失败即可
        if (typeof fail === 'function') { try { fail('no native bridge: ' + service + '/' + action); } catch (e) {} }
        return;
      }
      Promise.resolve(invoke('plugin', { service: service, action: action, args: args || [] }))
        .then(function (r) { if (typeof success === 'function') success(r); },
              function (e) { if (typeof fail === 'function') fail(e); });
    };
  }

  if (!cordova.require) {
    var modules = {};
    cordova.define = cordova.define || function (id, factory) {
      modules[id] = { factory: factory };
    };
    cordova.require = function (id) {
      var m = modules[id];
      if (!m) return {};
      if (!m.exports) {
        m.exports = {};
        m.factory(cordova.require, m.exports, m);
      }
      return m.exports;
    };
  }

  if (!cordova.fireDocumentEvent) {
    cordova.fireDocumentEvent = function (name, data) {
      try {
        var ev = document.createEvent('Event');
        ev.initEvent(name, true, true);
        if (data) for (var k in data) ev[k] = data[k];
        document.dispatchEvent(ev);
      } catch (e) {}
    };
  }

  cordova.platformId = cordova.platformId || (isIOS ? 'ios' : 'browser');
  cordova.version = cordova.version || 'noname-ios-stub';
  window.cordova = cordova;

  /* ---- 2. 触发 deviceready ---- */
  // game.js 是先 append <script> 再注册 deviceready 监听，
  // 动态脚本的执行时机在监听注册之后；但为万无一失，这里多次触发：
  // lib.init.cordovaReady 在首次被调用后会被 delete，重复触发无副作用。
  var fire = function () {
    try {
      cordova.fireDocumentEvent('deviceready');
      console.log('[cordova-stub] deviceready fired');
    } catch (e) {
      console.error('[cordova-stub] failed to fire deviceready', e);
    }
  };
  setTimeout(fire, 0);
  setTimeout(fire, 300);
  setTimeout(fire, 1200);

  console.log('[cordova-stub] loaded, platform=' + cordova.platformId);
}());
