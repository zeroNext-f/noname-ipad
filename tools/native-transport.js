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
