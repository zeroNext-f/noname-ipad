# 项目状态速查（**历史文档，已过期**）

> ⚠️ **请看 `HANDOFF.md`（最新、唯一权威的交接文档）。**
> 本文件反映的是 **2026-10-13 早上**的状态。当时判断"已完成"，但之后又发现并修复了
> 13 个问题（内存炸弹 709MB、手牌概率性错位、过期技能崩溃、jiubuff 图集缺失……）。
> **本文件仅作历史参考，不要据此继续工作。**
>
> 最后更新：2026-10-13（早）｜ 已被 `HANDOFF.md` 取代

---

## 一、一句话状态

**✅ 已完成。** 安卓版《无名杀十周年版（诗筏）》已成功移植到 iPad 并**可正常游玩**（武将立绘/卡牌/装备/技能弹窗全部正常）。

---

## 二、关键路径与地址

| 项目 | 值 |
|---|---|
| 工程根目录 | `E:\noname-port\iosport` |
| 游戏本体（已解压） | `E:\noname-port\iosport\payload\game`（25,589 文件 / 2.46 GB） |
| 原始 APK | `D:\Quark\无名杀（诗筏）.apk` |
| GitHub 仓库 | `https://github.com/zeroNext-f/noname-ipad`（**公开**） |
| Apple ID | `joyhewen@163.com`（签名用，配 **App 专用密码**） |
| iPad | iPad 6（机型码 `iPad7,5`）/ iPadOS **17.7.11** |
| iPad UDID | `551cbf4e8b4fe54346ed8224495105f80bb8a043` |
| 电脑 WLAN IP | **`10.216.63.85`**（VMware 虚拟网卡 192.168.19.1 / 192.168.234.1 **不要用**） |
| 证书到期 | **2026-10-20 23:28**（7 天后需重签） |

### 端口约定

| 端口 | 用途 |
|---|---|
| 8123 | 网页版（Safari 兜底方案）`tools/serve.js --lan` |
| 8124 | 游戏数据分发到 iPad `tools/share.js` |
| 26789 | App 内置本地 HTTP 服务（仅回环，端口冲突时自动 +1..+9） |

---

## 三、这套移植的原理（三层，缺一不可）

```
APK = Cordova 壳 + assets/www 启动器 + 2.2GB 网页游戏本体
关键事实：游戏本体是纯 HTML/JS，源码里本来就有 ios 分支
          （lib.device 由 UA 判定；config.js 有 show_statusbar_ios）
```

1. **平台垫片** `shim/noname-cordova-shim.js`
   补齐游戏 iOS 分支需要的全部原生 API：`resolveLocalFileSystemURL` /
   `FileTransfer` / `cordova.file` / `StatusBar` / `navigator.notification` / `jsBridge`。
   传输层可插拔：桌面走 HTTP，iOS 走 `WKScriptMessageHandler`。
   另外把 `noname_0.9_loadtime` 默认放宽到 60 秒（首启加载慢，避免游戏误判"载入失败"）。

2. **cordova.js 兼容桩** `cordova/www/cordova.js`
   游戏在 app 模式下会**自己动态加载 `cordova.js`** 并等 `deviceready`；
   真机没有 Cordova 原生层，用它顶替并主动触发 `deviceready`。

3. **iOS 原生工程** `ios/`（XcodeGen 生成）
   WKWebView 容器 + 回环 HTTP 服务 + 原生桥 + 局域网数据镜像。

---

## 四、踩过的坑（**绝对不要重复**）

### 构建 / CI 相关

| 坑 | 结论 |
|---|---|
| `xcodebuild: Unable to read project`（exit 74） | 新版 XcodeGen 生成 `objectVersion=77`（Xcode 16 格式），macos-14 的 Xcode 15 读不了 → **用 `runs-on: macos-15`**，并保留 objectVersion 自动降级兜底 |
| exit 134 SIGABRT | **绝不要写 `xcodebuild ... \| head -1`** —— head 早退导致上游 EPIPE/SIGABRT |
| 不要用 `-scheme` | 改用 `xcodebuild -target`，避开 scheme 文件问题 |
| 读不到 CI 日志 | 已在工作流里做两步：① 失败时把错误以 `::error::` 抛成 **annotation**（免登录可读 API）；② 日志推到独立 **`ci-logs` 分支** |
| PowerShell 脚本中文乱码/解析失败 | `.ps1` 必须存成 **UTF-8 带 BOM**（Windows PowerShell 5.1 要求） |
| PowerShell `[int]` | 是**四舍五入**不是截断，算天数要用 `[math]::Floor` |

### Swift 相关

| 坑 | 结论 |
|---|---|
| `unterminated '/*' comment` | **Swift 块注释可嵌套**！注释里不能出现 `/*`（例如写路径 `Web/*` 就会炸，且会连带报一堆"找不到类型"） |
| `closure expects 2 arguments, but 1 was used` | `reduce` 的简写闭包只用 `$0` 会报错 → 改用显式循环或 `{ a, b in ... }` |
| 混合类型数组字面量 | 显式写 `let arr: [UIView] = [...]` |

### iOS 运行时相关（**最重要**）

| 坑 | 结论 |
|---|---|
| App 连不上局域网电脑，报 `The Internet connection appears to be offline` | **Info.plist 必须有 `NSLocalNetworkUsageDescription`**（iOS 14+ 第三方 App 访问局域网要授权）。Safari 不需要，所以"同一地址 Safari 能开、App 不能开"就是这个原因 |
| 打开 App 立刻闪退（5ms，EXC_BREAKPOINT） | **WKWebView / UIKit 必须在主线程调用**。`NWListener` 的 `stateUpdateHandler` 跑在后台队列 —— 在那里直接 `webView.load()` 会被 WebKit 判为致命错误。**所有服务回调必须 `DispatchQueue.main.async`** |
| 游戏卡在"载入失败"弹窗 | `lib.init.reset` 看门狗默认 5 秒；垫片已放宽到 60 秒 |

---

## 五、日常维护（只有一件事）

**证书 7 天过期（2026-10-20 23:28）**，到期后 App 闪退属正常：

```
1. 爱思助手 → 工具箱 → IPA签名
2. 「移除」旧 IPA → 「添加 IPA 文件」→ 选 NonameDecade-unsigned.ipa
3. 勾选 IPA + joyhewen@163.com → 立即签名
4. 安装（覆盖安装即可，**存档不丢**）
```

如需重新构建（改了代码）：推 GitHub → Actions 自动出未签名 IPA → 下载重签。

---

## 六、可用工具（`tools\` 下，双击即用）

| 工具 | 用途 |
|---|---|
| `prepare.ps1` | 从 APK 提取游戏本体（幂等，已存在则跳过） |
| `serve.js` | 网页验证/兜底（`--lan` 开放局域网） |
| `share.js` | 把游戏数据分发到 iPad（带进度输出） |
| `verify-ipa.ps1/.cmd` | **校验 IPA 签名**：有效期、绑定 UDID、结构完整性 |
| `push-github.ps1` | 一键提交推送（`-Ssh` 走 SSH） |
| `sync-web.js` | 把 Web 壳同步进 iOS 工程（CI 也会跑） |
| `start-share.cmd` / `start-lan.cmd` | 双击启动对应服务 |
| `check-gsa.ps1/.cmd` | 诊断苹果签名服务连通性 |

### 排障用日志

App 内日志：`爱思助手 → 我的设备 → 应用 → 无名杀十周年版 → 浏览 → Documents → noname-debug.log`
（记录了 App 启动、本地服务状态、页面加载结果、**游戏内全部 console 输出与未捕获异常**）

---

## 七、尚未完成 / 可扩展的点

| 项目 | 说明 |
|---|---|
| **原生扩展市场 UI** | 原 APK 是 Android 专有 DataBinding 界面，无法直接搬。目前游戏内自带的扩展下载/管理链路已可用（`game.download`/`getFileList`/`writeFile` 均已接通）；`jsBridge` 的扩展接口在 `NativeBridge.swift` 里已保留完整 |
| **在线更新** | 原包从 `gitcode.net/qq_4614377/noname-decade` 拉更新；未接入 |
| **自动续签** | 目前每 7 天手动重签。若需自动化可考虑 AltStore 方案 |
| **iPad 6 内存** | 2GB，目前运行正常；若长局出现闪退需观察 `noname-debug.log` 是否 jetsam |

---

## 八、桌面验证（改代码时最快的迭代方式）

**不用重新打包**，直接改 `shim/` 或 `cordova/www/`，然后：

```powershell
cd E:\noname-port\iosport
node tools\serve.js
# 浏览器打开 http://127.0.0.1:8123/?force=ios     ← ?force=ios 强制走真机同一条代码分支
```

`?force=ios` 会覆盖 UA 让游戏判定为 iPad，跑的是**和 App 里完全相同的垫片逻辑**。
