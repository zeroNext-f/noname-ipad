'use strict';
(function () {
    var lib = {
        configprefix: 'noname_0.9_'
    };

    var cache = {};

    var app = {
        initialize: function () {
            this.jsReady();
            // this.javaReady();
            this.openDB();
        },
        jsReady: function () {
        },
        openDB: function () {
            if (lib.db) {
                console.log("db is not close, close first");
                lib.db.close(function () {
                    lib.db = null;
                    this.openDB();
                });
                return;
            }

            var request = window.indexedDB.open(lib.configprefix + 'data', 4);
            request.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains('video')) {
                    db.createObjectStore('video', {keyPath: 'time'});
                }
                if (!db.objectStoreNames.contains('image')) {
                    db.createObjectStore('image');
                }
                if (!db.objectStoreNames.contains('audio')) {
                    db.createObjectStore('audio');
                }
                if (!db.objectStoreNames.contains('config')) {
                    db.createObjectStore('config');
                }
                if (!db.objectStoreNames.contains('data')) {
                    db.createObjectStore('data');
                }
            };
            request.onsuccess = function (e) {
                lib.db = e.target.result;
                console.log("openDB success.");
                window.jsBridge.importGameData();
            }
        },
        getDB: function (key, callback) {
            if (!lib.db) {
                console.log("getDB, lib.db: " + lib + ", key: " + key);
                return;
            }

            if (key) {
                // 如果缓存里面有，就从缓存里面取
                if (cache.hasOwnProperty(key)) {
                    var value = cache[key];
                    console.log("cache get：key = " + key + " ,value = " + value);
                    callback(value);
                    return;
                }
                var store = lib.db.transaction(['config'], 'readwrite').objectStore('config');
                store.get(key).onsuccess = function (e) {
                    cache[key] = e.target.result;
                    callback(e.target.result)
                };
            }
        },
        putDB: function (type, key, value, onsucc) {
            if (!lib.db) {
                console.log("putDB, lib.db: " + lib + ", key: " + key + ", value: " + value);
                return;
            }
            // 及时给缓存添加上
            console.log("cache set, success, key: " + key + ", value: " + value);
            cache[key] = value;

            var put = lib.db.transaction([type], 'readwrite').objectStore('config').put(value, key);
            put.onsuccess = function () {
                console.log("putDB, success, key: " + key + ", value: " + value);

                if (onsucc) {
                    onsucc();
                }
            };
        },
        putConfigDB: function (key, value, onsucc) {
            this.putDB('config', key, value, onsucc);
        },
        closeDB: function () {
            if (lib.db) {
                lib.db.close();
                lib.db = null;
            }
        },
        decode: function (str) {
            var strUtf = atob(str);
            var strUni = strUtf.replace(
                /[\u00e0-\u00ef][\u0080-\u00bf][\u0080-\u00bf]/g, function (c) {
                    var cc = ((c.charCodeAt(0) & 0x0f) << 12) | ((c.charCodeAt(1) & 0x3f) << 6) | (c.charCodeAt(2) & 0x3f);
                    return String.fromCharCode(cc);
                });
            strUni = strUni.replace(
                /[\u00c0-\u00df][\u0080-\u00bf]/g, function (c) {
                    var cc = (c.charCodeAt(0) & 0x1f) << 6 | c.charCodeAt(1) & 0x3f;
                    return String.fromCharCode(cc);
                });
            return strUni;
        },
        importData: function (data) {
            try {
                console.log("开始导入数据", data);
                this.importDatax(data);
            } catch (e) {
                console.error(e)
            } finally {
                console.log("导入数据完毕！");
                window.jsBridge.importDataFinish()
            }
        },
        importDatax: function (data) {
            try {
                data = JSON.parse(this.decode(data));
                if (!data || typeof data != 'object') {
                    throw('err');
                }
                if (lib.db && (!data.config || !data.data)) {
                    throw('err');
                }
            } catch (e) {
                console.log(e);
//                window.jsBridge.addErrorMessage("导入失败：" + e);
                return;
            }
            if (!lib.db) {
                var noname_inited = localStorage.getItem('noname_inited');
                var onlineKey = localStorage.getItem(lib.configprefix + 'key');
                localStorage.clear();
                if (noname_inited) {
                    localStorage.setItem('noname_inited', noname_inited);
                }
                if (onlineKey) {
                    localStorage.setItem(lib.configprefix + 'key', onlineKey);
                }
                for (var i in data) {
                    localStorage.setItem(i, data[i]);
                }
            } else {
                for (var i in data.config) {
                    this.putConfigDB(i, data.config[i]);
                }
                for (var i in data.data) {
                    this.putDB('data', i, data.data[i]);
                }
                if(data.localStorage) {
                    for (var i in data.localStorage) {
                        localStorage.setItem(i, data.localStorage[i]);
                    }
                }
            }
//            window.jsBridge.addMessage("导入设置完成！");
        },
    };

    app.initialize();
    window.app = app;
}());

(function () {
    var preapp = {
        url: String,
        initialize: function () {
            this.initJavaArgs();
        },
        initJavaArgs: function () {
            this.url = window.jsBridge.getGamePath();
            console.log("load, this.url: " + this.url);

            if (localStorage.getItem("noname_inited") != this.url) {
                localStorage.setItem('noname_inited', this.url);
            }

            this.start();
        },
        afterLoad: function() {
            console.log("afterLoad ");
        },
        start: function () {
            var url = this.url;
            var loadFailed = function () {
                alert("主要文件加载失败，请检查文件\n\b文件路径：" + this.src);
//                window.location.reload();
            }

            var load = function (src, onload, onerror) {
                console.log("load, src: " + src);

                var script = document.createElement('script');
                script.src = url + 'game/' + src + '.js';
                script.onload = onload;
                script.onerror = onerror;
                document.head.appendChild(script);
            }

            var afterLoad = this.afterLoad;

            load('update', function () {
                load('config', function () {
                    load('package', function () {
                        load('game', afterLoad, loadFailed);
                    }, loadFailed);
                }, loadFailed);
            }, loadFailed);
        }
    };

    preapp.initialize();
}());
