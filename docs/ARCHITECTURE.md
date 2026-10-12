# 技术分析：从 APK 到 iPad

本文记录对 `无名杀（诗筏）.apk` 的逆向分析结论，以及移植方案的每个设计决策依据。

---

## 一、APK 结构

```
AndroidManifest.xml            9,820 B
classes.dex                    6.8 MB     原生代码（Kotlin/Java + Cordova）
resources.arsc                 874 KB
res/                           812 个文件（图标、布局、原生 UI）
lib/<abi>/lib7-Zip-JBinding.so 7-Zip JBinding（运行时解压游戏包）
lib/<abi>/libmmkv.so           MMKV 键值存储
assets/www/                    41 个文件  ← 启动器网页（Cordova 壳）
assets/html/                   3 个文件   ← 另一个启动页（旧版）
assets/noname-decade.zip       2.386 GB   ← 游戏本体（未压缩存储）
META-INF/                      签名
```

包名 `online.nonamekill`，应用名"无名杀十周年版"，数据目录 `com.widget.noname.qingyao`。

## 二、游戏本体结构

解开 `noname-decade.zip`（26,716 条目 / 2.46 GB）：

```
game/          20 个文件   核心：update.js config.js package.js game.js asset.js ...
character/     41 个文件   武将定义
card/          16 个文件   卡牌定义
mode/          15 个文件   游戏模式
theme/        113 个文件   主题皮肤
layout/        27 个文件   布局样式
extension/  13461 个文件   扩展（1.82 GB，占大头）
audio/       7553 个文件   音频（443 MB）
image/       5114 个文件   图片（297 MB）
font/          11 个文件   字体（51 MB）
node_modules/ 344 个文件   ws / ultron / options（联机服务端用）
```

**注意：本体内没有 `index.html`。** 入口由壳提供，游戏只是一个"资源目录"。

## 三、游戏如何识别运行环境

`game/game.js` 是一个巨型 IIFE，启动时按下面顺序决定平台后端：

```js
var noname_inited = localStorage.getItem('noname_inited');
if (noname_inited && noname_inited !== 'nodejs') {
    var ua = navigator.userAgent.toLowerCase();
    if (ua.indexOf('android') != -1)                        lib.device = 'android';
    else if (ua.indexOf('iphone') != -1
          || ua.indexOf('ipad') != -1
          || ua.indexOf('macintosh') != -1)                 lib.device = 'ios';
    lib.assetURL = noname_inited;          // ← 资源根路径
}
...
if (lib.device) {
    /* ① Cordova 移动端后端（Android / iOS 共用） */
    lib.init.cordovaReady = function () { ... };
    game.download  = /* FileTransfer */;
    game.readFile  = /* resolveLocalFileSystemURL */;
    game.writeFile = ...; game.removeFile = ...;
    game.getFileList = ...; game.ensureDirectory = ...;
} else if (typeof window.require == 'function') {
    /* ② Node / Electron 后端 */
    lib.node = { fs: require('fs'), debug: ... };
    ...
} else {
    /* ③ 纯浏览器：无文件后端，功能退化 */
}
```

结论：

* **`lib.assetURL` 由 `localStorage.noname_inited` 决定**，而它由原生壳写入。
* **`lib.device` 由 UA 决定** —— iPad 的 WKWebView 自然命中 `ios`。
* 只要设好 `noname_inited` 并让 UA 含 `ipad`，游戏就自动走 ①。

## 四、iOS 分支到底需要哪些原生接口

对 `game.js` 里 Cordova 后端逐条提取，得到完整清单：

| 接口 | 用途 |
|---|---|
| `window.resolveLocalFileSystemURL(url, ok, err)` | 所有文件读写的入口 |
| `entry.getFile(name, flags, ok, err)` | 取文件（`{create:true}` 建文件） |
| `fileEntry.file(ok, err)` | 得到 `File`/`Blob` |
| `fileEntry.createWriter(ok)` → `writer.write(data)` + `onwriteend` | 写文件 |
| `entry.getDirectory(name, flags, ok, err)` | 建目录 |
| `entry.createReader().readEntries(ok)` | 列目录（游戏循环读到空数组为止） |
| `entry.remove()` | 删文件 |
| `window.FileTransfer().download(src, dst, ok, err)` + `onprogress` | 下载扩展/更新 |
| `cordova.file.documentsDirectory` | iOS 专用目录键 |
| `cordova.file.externalDataDirectory` | Android 专用目录键 |
| `window.StatusBar.*` | 状态栏 |
| `navigator.notification.confirm/alert` | 对话框 |
| `navigator.app.exitApp()` | 退出 |
| `document` 上的 `pause` / `resume` 事件 | 前后台 |

另一个关键点：

```js
window.onload = function () {
    if (lib.device) {
        var script = document.createElement('script');
        script.src = 'cordova.js';            // ← 游戏自己加载 cordova.js
        document.body.appendChild(script);
        document.addEventListener('deviceready', function () {
            lib.init.cordovaReady();
        });
    }
    ...
};
```

**app 模式下游戏会动态加载 `cordova.js` 并等待 `deviceready`**。
真机上没有 Cordova 原生层，所以必须替换掉这个文件。

## 五、自定义原生桥 `jsBridge`

从 `classes.dex` 提取到的桥接口：

```
Java 类:  online.nonamekill.android.module.import_progress.bridge.JsBridgeInterface
JS 名:    window.jsBridge
方法:     getGamePath  setGamePath  importGameData  importDataFinish
         getExtensions  addExtension  removeExtension  enableExtension  getExtensionState
         addMessage  addErrorMessage  jsBridgeCallback  setNativeToJsBridgeMode
回调:     onAddExtension  onRemoveExtension  onGetExtensions  onEnableExtension ...
```

原生侧还有整套 DataBinding UI（`ImportActivity`、`LocalExtensionFragment`、
`DownloadExtensionFragment`、`ModuleManager`），以及更新/扩展源：

```
更新源: https://gitcode.net/qq_4614377/noname-decade/-/raw/master/
扩展源: https://gitcode.net/qq_4614377/noname-extension/-/raw/master/extension-info.json
```

## 六、移植设计决策

### 决策 1：不重建 Cordova，自己做容器

Cordova iOS 需要重写全部自定义插件，且其自定义 scheme 在存储行为上跨版本不一致。
自建 WKWebView 容器 + 少量原生代码反而更可控。

### 决策 2：用回环 HTTP，不用 `file://` / 自定义 scheme

| 方案 | 子资源 | XHR | localStorage / IndexedDB |
|---|---|---|---|
| `file://` + `loadFileURL` | 可用 | **被禁** | **不可靠** |
| 自定义 scheme + `WKURLSchemeHandler` | 可用 | 部分受限 | 跨版本不一致 |
| **`http://127.0.0.1:port/`** | 可用 | 可用 | **正常** |

游戏依赖 `localStorage` + `IndexedDB` 存档，并会发 XHR，
所以选第三种。服务只监听 `127.0.0.1`，端口被占用时自动向后顺延 9 个。

### 决策 3：垫片与传输层分离

`shim/noname-cordova-shim.js` 实现全部语义，`invoke(method, args)` 是唯一出口：

* 桌面验证：无 `window.__nonameInvoke` → 走 `fetch('/__bridge/*')`
* iOS 真机：`WKUserScript` 注入 `tools/native-transport.js` 定义 `__nonameInvoke`
  → `WKScriptMessageHandler` → 原生 → `window.__nonameNativeReply(id, json)`

同一份垫片两端验证，桌面端就是真机行为的可调试替身。

### 决策 4：替换 `cordova.js`

`cordova/www/cordova.js` 被换成一个兼容桩：保证 `window.cordova` 存在、
提供 `cordova.exec/define/require`，并**多次触发 `deviceready`**
（`lib.init.cordovaReady` 首次调用后会被 delete，重复触发无副作用）。

### 决策 5：放宽首启看门狗

`lib.init.init()` 会设：

```js
window.resetGameTimeout = setTimeout(lib.init.reset, loadtime || 5000);
```

移动端首次启动要加载 70+ 个角色/卡牌/模式脚本，容易超过默认 5 秒，
触发"游戏未正常载入"弹窗。垫片把 `noname_0.9_loadtime` 默认放宽到 60 秒
（只放宽容错窗口，不改游戏逻辑）。

### 决策 6：游戏数据用「局域网逐文件镜像」，不用压缩包

* iOS 没有内置 zip 解压 API，2.5 GB 一次性解压内存与中断风险都高
* 逐文件镜像天然支持**断点续传**（按 `路径 + 大小` 比对跳过）与进度显示
* 电脑端 `tools/share.js` 提供 `/__manifest` 清单 + 逐文件下载

### 决策 7：扩展市场 / 更新怎么办

原包的扩展市场是**原生 Android UI**，无法直接搬。
但游戏本体自带扩展与更新逻辑（`lib.config.extension_sources`、
`lib.configMenu` 中的"扩展"面板，以及 `game.download` 提供的下载能力），
垫片已把 `game.download`、`getFileList`、`writeFile` 全部接通，
因此游戏内的扩展下载/管理/更新链路可用。

原生桥 `jsBridge` 的扩展相关方法在 `NativeBridge.swift` 里保留了完整接口，
后续要补原生管理界面时可直接接入。

## 七、验证结果（桌面端）

用 `tools/serve.js` + `?force=ios`（强制 UA 命中 iPad，走真实 iOS 分支）验证：

* 4 个核心脚本按序加载，74 个资源全部 200
* 文件读：`game/package.js` → 2600 字节，内容正确
* 文件写 + 回读：`UserData/probe/__io_probe.json` → `{"hello":"无名杀","n":123}` ✓
* 目录枚举 / 不存在路径报错 ✓
* 模式选择界面、主菜单、战场 DOM 全部渲染
* 点击进入游戏正常
* 控制台无任何 error/warning
