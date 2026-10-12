# 无名杀十周年版 · iPad 移植

把安卓版《无名杀（诗筏/十周年）》安装包移植成可在 **iPad** 上运行的 App。

```
原包：D:\Quark\无名杀（诗筏）.apk   (2.24 GB, Cordova 壳 + 2.2 GB 游戏本体)
目标：iPad 6 代 / iPadOS 17.7   完整还原（单机 + 联机 + 扩展 + 更新 + 存档）
```

---

## 这个包到底是什么

`无名杀（诗筏）.apk` **不是原生游戏**，而是一个 Cordova(PhoneGap) 网页壳 + 一堆网页游戏源码：

| 组件 | 位置 | 作用 |
|---|---|---|
| 启动器网页 | `assets/www/` | 进度导入、拉起游戏 |
| 游戏加载页 | `assets/html/start.*` | 按序加载 `game/update→config→package→game` |
| 原生桥 + 原生 UI | `classes.dex` | `jsBridge`、解压、扩展市场、更新 |
| **游戏本体** | `assets/noname-decade.zip` | **2.2 GB 纯 HTML/JS/素材** |

关键结论：**游戏本体是纯网页代码，跨平台，且源码里本来就有 `ios` 分支**
（`lib.device` 由 UA 自动判定，`config.js` 里有 `show_statusbar_ios`）。

所以移植的实质是——**在 WKWebView 里补齐它期望的原生接口**。

---

## 整体方案

```
┌─ PC (Windows) ─────────────────────────────┐      ┌─ iPad ─────────────────────┐
│ tools/prepare.ps1   从 APK 提取游戏本体      │      │ NonameDecade.app           │
│ tools/serve.js      桌面验证服务器            │      │  ├ WKWebView               │
│ tools/share.js      局域网分发游戏数据 ───────┼─WiFi→│  ├ 本地 HTTP 服务(回环)     │
│ tools/sync-web.js   同步 Web 壳               │      │  ├ 原生桥 (文件/下载)       │
└────────────────────────────────────────────┘      │  └ Web 壳 + 平台垫片        │
        ▲                                            └────────────────────────────┘
        │ GitHub Actions (macOS runner) 出未签名 IPA
        └──────────────── Sideloadly + Apple ID 签名安装
```

三层解耦，同一份 JS 代码跑两端：

1. **平台垫片** `shim/noname-cordova-shim.js`
   补齐 `resolveLocalFileSystemURL` / `FileTransfer` / `cordova.file` /
   `StatusBar` / `navigator.notification` / `jsBridge` —— 游戏的 iOS 分支要的全套。
   传输层可插拔：桌面走 HTTP，iOS 走 `WKScriptMessageHandler`。

2. **cordova.js 兼容桩** `cordova/www/cordova.js`
   游戏在 app 模式下会动态加载 `cordova.js` 并等 `deviceready`，
   真机上没有 Cordova 原生层，用它顶替并主动触发 `deviceready`。

3. **iOS 原生工程** `ios/`
   WKWebView 容器 + 回环 HTTP 服务 + 原生桥 + 局域网数据镜像。

---

## 快速开始

### 0. 准备游戏本体

```powershell
cd iosport
powershell -ExecutionPolicy Bypass -File tools\prepare.ps1
```

产出 `payload/game/`（约 2.5 GB，25,595 个文件）。

### 1.（可选）先在电脑上验证

```powershell
node tools\serve.js
# 浏览器打开 http://127.0.0.1:8123/
# 想测试真实 iOS 代码分支：http://127.0.0.1:8123/?force=ios
```

能看到游戏模式选择界面即正常。

### 2. 构建 IPA（无需 Mac）

把 `iosport` 目录推到 GitHub 仓库，Actions 会跑 `.github/workflows/build-ipa.yml`，
在 macOS runner 上生成 **未签名 IPA**，在 Artifacts 下载。

### 3. 签名安装到 iPad

用 **Sideloadly**（Windows 版）+ 你的 Apple ID 签名安装。
详见 [`docs/BUILD-AND-INSTALL.md`](docs/BUILD-AND-INSTALL.md)。

### 4. 首次启动导入游戏数据

iPad 与电脑连同一 Wi-Fi，电脑上：

```powershell
node tools\share.js
```

它会在局域网提供一个地址（如 `http://192.168.1.100:8124/`）。
在 iPad 的 App 里填入该地址 → 「开始同步」。约 2.5 GB，可中断续传。

---

## 目录结构

```
iosport/
├─ cordova/www/                 启动器壳（含 cordova.js 兼容桩）
├─ shim/noname-cordova-shim.js  平台垫片（核心）
├─ ios/                         Xcode 工程（XcodeGen）
│  ├─ project.yml
│  └─ NonameDecade/
│     ├─ Sources/               Swift 源码
│     ├─ Web/                   Web 壳（由 tools/sync-web.js 生成）
│     └─ Assets.xcassets/
├─ tools/                       prepare / serve / share / sync-web
├─ docs/                        技术分析与安装文档
└─ .github/workflows/           云 macOS 构建
```

---

## 文档

| 文档 | 内容 |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | APK 逆向分析 + 移植面 + 设计决策 |
| [`docs/BUILD-AND-INSTALL.md`](docs/BUILD-AND-INSTALL.md) | 构建、签名、Sideloadly、常见问题 |

---

## 合规提示

本项目仅做**技术移植**。游戏本体版权归原作者所有；
上游官方仓库（`libnoname/noname`）为 GPL-3.0，且官方声明
"ios 端只提供网页版"。请勿用于商业用途。
