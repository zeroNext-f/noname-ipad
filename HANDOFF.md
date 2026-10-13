# 无名杀 iPad 移植 —— 交接文档（下一位 DeepSeek 专用）

> 写于 **2026-10-14 00:15** ｜ 上一棒：移植 + 13 个补丁 + 内存问题全部解决
> **本文件是唯一权威的现状说明。** `PROJECT-STATE.md` 已过期，只作历史参考。
> **你（下一位）的主要工作：等用户导入「动态皮肤包」→ 重新构建最终版 IPA。**

---

## 0. 一句话现状

**移植已基本完成。** iPad 上能正常游玩、长局不再闪退、手牌不再错位。
**只剩两件事**：① 等用户的「动态皮肤包」（会补上缺失的 `dynamicSkin.js`）；② 之后重新构建 IPA。

**当前报错（每局固定 2~3 条，全部无害）**：

```
[error] .../十周年UI/dynamicSkin.js?v=not found      ← 等皮肤包，会消失
[error] loadSpine: [lianzhao_jindu] 加载失败.        ← 无害，见 §9
[error] loadSpine: [lianzhao_zuowei] 加载失败.       ← 无害，见 §9
```

---

## 1. 项目是什么

把安卓 APK `D:\Quark\无名杀（诗筏）.apk`（Cordova 壳 + 2.2 GB 网页游戏，十周年/诗筏整合包）
**完整还原**地移植到 iPad。**不是**只跑基础版——要保留全部扩展、手杀 UI、动态立绘。

**关键事实**：游戏本体是纯 HTML/JS，源码里**本来就有 iOS 分支**（`lib.device` 由 UA 判定）。
所以移植的本质是**把缺失的原生 API 补齐**，而不是重写。

### 目标设备 / 账号

| 项目 | 值 |
|---|---|
| iPad | iPad 6（机型码 `iPad7,5`）／ iPadOS **17.7.11** ／ **2 GB 内存** |
| UDID | `551cbf4e8b4fe54346ed8224495105f80bb8a043` |
| Apple ID | `joyhewen@163.com`（配 **App 专用密码**） |
| 证书有效期 | 每次重签 **7 天**（请向用户确认当前到期时间） |
| GitHub 仓库 | `https://github.com/zeroNext-f/noname-ipad`（公开） |

### 电脑环境

| 项目 | 值 |
|---|---|
| 工程根目录 | `E:\noname-port\iosport` |
| 游戏数据（已打补丁） | `E:\noname-port\iosport\payload\game`（25,589 文件 / 2.46 GB） |
| 电脑 WLAN IP | **`10.216.63.85`**（**别用** VMware 的 192.168.19.1 / 192.168.234.1） |
| 平台 | Windows + **PowerShell 5.1**（不是 7） |

---

## 2. 架构（三层，缺一不可）

```
APK = Cordova 壳 + assets/www 启动器 + 2.2GB 纯 HTML/JS 游戏
      ↓ 移植思路：不重写游戏，只补它需要的原生 API
```

| 层 | 位置 | 作用 |
|---|---|---|
| ① 平台垫片 | `shim/noname-cordova-shim.js` | 补齐 `resolveLocalFileSystemURL` / `FileTransfer` / `cordova.file` / `StatusBar` / `navigator.notification` / **`requestIdleCallback` polyfill** / `jsBridge` |
| ② cordova 桩 | `cordova/www/cordova.js` | 游戏会自己动态加载 `cordova.js` 并等 `deviceready`，用它顶替并主动触发 |
| ③ iOS 原生 | `ios/NonameDecade/Sources/*.swift` | WKWebView 容器 + **回环 HTTP 服务（26789）** + 原生桥 + 局域网数据镜像 |

**为什么用本地 HTTP 服务而不是 `file://`**：`file://` 下 XHR / storage / 部分 API 会被 WebKit 限制，
用回环 HTTP 就完全等价于网页版，踩坑最少。

### 数据分发

游戏数据（2.46 GB）**不打进 IPA**，而是：

| 方式 | 工具 | 端口 | 说明 |
|---|---|---|---|
| 增量覆盖（**常用**） | 爱思助手手动复制 | — | 见 §5，只覆盖改过的文件 |
| 全量分发 | `node tools\share.js` | 8124 | 局域网推送到 iPad 的 `Documents/noname` |
| 桌面预览 | `node tools\serve.js` | 8123 | 浏览器开 `http://127.0.0.1:8123/?force=ios` |

---

## 3. 当前已完成 ✅

| 问题 | 状态 | 靠什么 |
|---|---|---|
| 点「开始游戏」黑屏 | ✅ | 补丁 1 |
| 画面每 1~2 分钟闪一下（无限重载） | ✅ | 补丁 2 |
| `requestIdleCallback` 缺失 | ✅ | 补丁 3 |
| 手牌/技能栏布局崩溃 | ✅ | 补丁 4 / 6 / 7 |
| EpicFX 缺素材 + 破坏布局 | ✅ | 补丁 5（+ 用户已删除该扩展） |
| Thunder「神宫」永久卡死 | ✅ | 补丁 8 |
| 「整理手牌」中断 | ✅ | 补丁 9 |
| `Region not found in atlas` ×46 刷屏 | ✅ | 补丁 10 |
| **手牌概率性向下偏移**（无报错、无规律） | ✅ | 补丁 11 |
| **长局闪退回大厅**（内存，709 MB） | ✅ | 补丁 12 |
| **过期技能崩溃卡结算** | ✅ | 补丁 13 |
| 扩展加载失败 ×16 刷屏 | ✅ | 配置 `最终版2` |
| 手牌/武将位置错乱 | ✅ | 保持十周年UI 原始设置（**见 §10**） |

### 13 个补丁清单（`tools/apply-patches.js`，**幂等**，可重复执行）

```
补丁 1   如真似幻 · 启动跳转地址（安卓专有路径 → 按平台选）
补丁 2   game.js · 禁用「诗筏」无限重载
补丁 3   update.js · requestIdleCallback polyfill
补丁 4   十周年UI/meihua.js · 手牌布局判空
补丁 5   EpicFX · 缺失素材预加载处理（该扩展已被用户删除，保留仅为可复现）
补丁 6   十周年UI/extension.js · 手牌布局判空
补丁 7   十周年UI · ui.confirm 判空（20 处，可选链）
补丁 8   Thunder · 神宫 spine 判空（防 game.pause 后永久卡死）
补丁 9   game.js · sortCard() 判空（修「整理手牌」）
补丁 10  十周年UI · jiubuff.atlas 补全（取自「标记补充」，修 46 条刷屏）
补丁 11  十周年UI · BoundsCache 未就绪时重试（修手牌概率性下移）
补丁 12  十周年UI · 砍掉 46 个骨骼的开机预加载（省约 709MB 内存）★
补丁 13  game.js · 过期技能判空（hasWuxie / hasUsableCard）
```

> **执行方式**：`cd E:\noname-port\iosport; node tools\apply-patches.js`
> 完成后务必 `node --check` 校验被改的 JS。

### 被补丁改过的 12 个文件（`payload/game/` 下）

```
game/game.js                                    1,853,524   (补丁 2/9/13)
game/update.js                                      5,564   (补丁 3)
extension/十周年UI/extension.js                   635,044   (补丁 6/7/11)
extension/十周年UI/meihua.js                      282,846   (补丁 4/7)
extension/十周年UI/markskill.js                   947,763   (补丁 7)
extension/十周年UI/markskill_noname.js            506,589   (补丁 7)
extension/十周年UI/animation.js                    58,451   (补丁 12)
extension/十周年UI/animationlist.js                   120   (补丁 12)
extension/十周年UI/assets/animation/jiubuff.atlas   2,958   (补丁 10)
extension/Thunder/extension.js                    439,476   (补丁 8)   ← 该扩展已删，可忽略
extension/EpicFX/extension.js                     224,037   (补丁 5)   ← 该扩展已删，可忽略
extension/如真似幻/js/rzsh.js                      32,001   (补丁 1)   ← 该扩展已删，可忽略
```

---

## 4. ⭐ 你的主要工作：动态皮肤包

### 背景

十周年UI 会请求一个**这个懒人包里根本不存在**的文件：

```js
// extension/十周年UI/extension.js:11288
this.js(decadeUIPath + 'dynamicSkin.js');
```

→ 表现：每局固定报一条
`http://127.0.0.1:26789/extension/十周年UI/dynamicSkin.js?v=not found`

**已全盘搜索确认**（`E:\noname-port`、`D:\Quark`、`C:\Users\ASUS\Documents`、`Downloads`、`Temp`）
—— 整个懒人包**都没有**这个文件。用户表示会**另外导入「动态皮肤包」**来补齐。

### 皮肤包到位后你要做的事

**① 确认文件是否补齐**

```powershell
Test-Path "E:\noname-port\iosport\payload\game\extension\十周年UI\dynamicSkin.js"
```

同时留意皮肤包可能带来**新的目录**（例如 `assets/dynamic/` —— `animation.js:1778` 引用了
`decadeUIPath + 'assets/dynamic/'`，很可能就是皮肤包的位置）。

**② 把缺的文件放到 `payload/game` 对应位置并同步到 iPad**（§5）

**③ 重点观察：布局的"敏感度"可能会变** ⚠️

这是**最关键的一条经验**（见 §10）：

- 目前 `dynamicSkin.js` **缺失** → 这套渲染走**降级路径** → 坐标计算**依赖那几个开关的组合**
  → 所以**必须保持原始值**（`dynamicSkin` / `outcropSkin` / `dynamicSkinOutcrop` 全 `true`）
- **模块补齐后，降级路径不再走** → **那些开关可能就允许调整了**
  → 如果用户想省性能，可以**重新一个开关一个开关地试**（一次只改一个！）

**④ 重新评估性能**

皮肤包会带来更多贴图 → 内存压力上升。**特别注意 §10 的内存教训**：
如果又开始闪退回大厅，优先怀疑**贴图内存**，用 `tools/diag/membudget.js` 估算。

**⑤ 若用户想构建最终版 IPA**（§6）

---

## 5. 工作流：如何把补丁同步到 iPad（**用户习惯，务必遵守**）

游戏数据不进仓库（`payload/` 被 `.gitignore` 排除），所以补丁通过**爱思助手手动覆盖文件**。
用户靠 **「修改日期 = 今天」** 来识别哪些文件是补丁版：

> **口诀：在资源管理器/爱思助手里按「修改日期」排序，日期=今天的就是补丁版。**

**⚠️ 注意（已踩过的坑）**：Windows 的 `CopyFile` 会**保留源文件的修改时间**，
所以**复制文件后必须重置时间戳**，否则这个口诀失效。
`tools/apply-patches.js` 的补丁 10 已内置 `fs.utimesSync`，**新增复制类补丁时请照做**。

### 推荐给用户的交付方式

1. 把要覆盖的文件**复制一份到 `C:\Users\ASUS\Downloads\`**（目标路径太深 + 含中文，用户不好找）
2. 明确告知：**「从 Downloads 的 X → 覆盖到 iPad 的 Y」**
3. 给出**校验值**（字节数 + 修改日期）让用户确认

### 用户的两台"资料源"

| 路径 | 内容 |
|---|---|
| `C:\Users\ASUS\Documents\Default Project\noname\` | **用户会把 iPad 上的游戏数据整个拷过来**（快照）—— 核对 iPad 实际状态最准的方式 |
| `C:\Users\ASUS\Documents\Default Project\noname-debug.log` | 同上，日志 |
| `C:\Users\ASUS\Documents\Default Project\noname\UserData\probe\` | 仅有个 I/O 探测文件，**配置不在这里** |

> **配置在哪**：`lib.config` 存在 **WKWebView 的 localStorage**（不在 Documents 里），
> 所以**无法直接读**。想看 iPad 的实际配置 → 让用户在游戏里「选项 → 其它 → 导出游戏设置」。
> **千万不要让用户"清缓存"** —— 那会把 `lib.config` 一起清掉！

### 当前的配置文件

`C:\Users\ASUS\Downloads\懒人包配置-最终版2.txt`（638,124 字节，base64）
= 原始懒人包配置，仅把扩展裁到**实际存在的 6 个**，并把 `plays` 列表里的 `AIoptimize` 去掉。

**生成脚本**：`tools/diag/gen-final2.js`（可作为以后改配置的模板）

### iPad 上当前的扩展（用户已大幅精简）

**已启用 6 个**：`十周年UI` · `手杀ui` · `皮肤切换` · `千幻聆音` · `后宫` · `势魏延`

**目录里存在但未启用**：`标记补充`（249.7 MB）—— 用户装回来的，但配置里没有它，**所以不会加载**。
它的 `animation/jiubuff.*` 是补丁 10 的来源（内容已复制进十周年UI）。

**已删除**：`EpicFX` · `如真似幻` · `Thunder` · `手杀全扩` · `斗转星移` · `曹髦滴圣剑` · `手杀将灯` · `星霜荏苒` · `抖音诗筏` 等。

---

## 6. 重新构建最终版 IPA

```powershell
# 本地不需要 Mac。推送到 GitHub 后由 Actions 构建（runs-on: macos-15）
cd E:\noname-port\iosport
git add -A
git -c core.autocrlf=false commit -m "..."
git push origin main
# → Actions 产出「未签名 IPA」→ 下载
```

**签名（Windows + 爱思助手）**：

```
爱思助手 → 工具箱 → IPA签名
① 「移除」旧 IPA
② 「添加 IPA 文件」→ 选 NonameDecade-unsigned.ipa
③ 勾选 IPA + joyhewen@163.com → 立即签名
④ 安装（覆盖安装即可，存档不丢）
```

**构建相关的坑（不要重复）**：

| 坑 | 结论 |
|---|---|
| `xcodebuild: Unable to read project`（exit 74） | XcodeGen 生成 `objectVersion=77` → **必须 `runs-on: macos-15`** |
| exit 134 SIGABRT | **绝不要写 `xcodebuild ... \| head -1`**（head 早退 → EPIPE → SIGABRT） |
| 不要用 `-scheme` | 用 `xcodebuild -target` |
| 读不到 CI 日志 | 工作流已内置：失败时抛 `::error::` annotation + 日志推到 `ci-logs` 分支 |
| Swift 块注释可嵌套 | 注释里**不能出现 `/*`**（写路径 `Web/*` 就会炸，并连带报一堆"找不到类型"） |
| `NSLocalNetworkUsageDescription` | Info.plist 必须有（iOS 14+ 访问局域网要授权） |
| WKWebView / UIKit 必须主线程 | 服务回调里操作 WebView 必须 `DispatchQueue.main.async` |
| `.ps1` 文件编码 | Windows PowerShell 5.1 要求 **UTF-8 带 BOM** |

> **如果只是改游戏数据（`payload/`）→ 不需要重新构建**，直接覆盖到 iPad 即可。

---

## 7. 诊断工具（`tools/diag/`）

| 脚本 | 用途 |
|---|---|
| `err-scan.js` | **报错清点**：按"每次启动"分组、去重、统计次数。分析日志第一步 |
| `timeline.js` | 打印每次启动的时间 + 报错种类 + 是否进过对局（按日志行数判断） |
| `membudget.js` | 按 atlas 声明的页面尺寸估算**骨骼解码后的内存**（找内存炸弹神器） |
| `preload.js` | 统计 `dcdanimation_list` 预加载列表的条目与贴图体积 |
| `reload.js` | 全盘搜索 `game.reload()` / `location.reload()` 触发点 |
| `gen-final2.js` | 按"iPad 实际存在的扩展"生成配置文件的模板 |

**用法**：`node tools\diag\err-scan.js`（内含日志路径，按需改）

**日志怎么拿**：用户在 App 里导出的 `noname-debug.log`
（爱思助手 → 我的设备 → 应用 → 无名杀十周年版 → 浏览 → Documents → `noname-debug.log`）

**验证补丁是否生效的日志标记**：

```
[iOS-port] game.js PATCH-2 ACTIVE                      ← 补丁 2
[iOS-port] requestIdleCallback polyfill INSTALLED      ← 补丁 3
[iOS-port] EpicFX equip1 preload SKIPPED (assets missing)  ← 补丁 5
[iOS-port bounds-retry]                                ← 补丁 11（代码里，日志无）
[iOS-port lazy-spine]                                  ← 补丁 12（代码里，日志无）
[iOS-port stale-skill]                                 ← 补丁 13（代码里，日志无）
```

---

## 8. 已知但**无害**的报错（不要浪费时间修）

### ① `loadSpine: [lianzhao_jindu] / [lianzhao_zuowei] 加载失败` —— 每局各 1 条

- **素材完整**：JSON 合法（spine 3.7），PNG 实际尺寸与 atlas 声明**完全一致**
- 属运行时加载问题；经统计**每局仅 2 条**，与卡顿**无相关性**
- 判定无害，**不用管**（真要排查：在 `animation.js:588/598` 打印失败路径）

### ② `playSpine: [xxx] 骨骼没有加载`

- 素材存在，属 iOS 上 spine 加载的时序问题；每次一条，动画会缺一次
- **补丁 12 已把它变成"按需加载 + 自动重播"**，会大幅减少

### ③ 日志里有 `PixiJS 6.5.9 - WebGL 1`、`dublicate characterIntro` 等
- 都是正常的加载输出，不是错误

### ④ `NetworkError: A network error occurred.`
- 瞬时网络错误（早期版本出现过），**当前已不再出现**

---

## 9. ⚠️ 绝对不要做的事（血泪教训）

### ① **不要动十周年UI 的「特效 / 皮肤」开关**（最重要）

2026-10-13 真机实测，**关掉任何一个都会同时造成「手牌/武将布局错位」和「更卡」**：

| 配置 | `dynamicSkin` | `outcropSkin` | 结果 |
|---|---|---|---|
| **原始值** | true | true | 布局 ✅ **正常** |
| 变体 A | false | true | 手牌 ❌ 向下偏移 |
| 变体 B | false | false | 武将 + 牌 ❌ 整体下移，**而且更卡** |

**同样不能动**：
`extension_十周年UI_gameAnimationEffect` / `JNTX` / `cardPhantom` / `effect_panding` /
`playerDieEffect`、以及 `extension_千幻聆音_qhly_decade*` ——
改了也会**布局出错 + 变慢**（引擎切到降级渲染路径）。

> **结论：性能只能靠"减少扩展数量"或"砍内存"来换，不能靠关这些开关。**
> **注意**：等 `dynamicSkin.js` 补齐后，这条可能**不再成立** —— 到时可以**重新逐项测试**（一次只改一个）。

### ② **不要让用户"清缓存"**

`lib.config`（包括用户导入的所有设置）存在 **localStorage / WKWebView 网站数据**里
→ 清缓存 = **配置全部归零**。
**要拿干净日志，只删 `Documents/noname-debug.log` 这一个文件即可。**

### ③ **不要为了省内存删掉 `手杀ui`**

它创建 **`ui.skillControl`（技能栏）**，是手牌/武将布局的命根子。
删掉它 → 布局必崩。

### ④ **不要指望"删掉扩展"没有副作用**

删掉扩展后，**武将/技能/卡牌的名字可能还残留在游戏数据里，但定义已经没了**
→ 代码碰到就是 `TypeError: undefined is not an object` 崩溃。
补丁 13 修的就是这个（`sb_sunquan` 神孙权的残留技能）。

**遇到同类弹框的处理办法**：
`get.info(名字)` 返回 `undefined` 后又被直接取属性 → 在那个函数里加 `if (!ifo) continue;`。
**先看错误框里的函数名 + 行号**（弹框里会显示完整调用栈）。

---

## 10. 内存：这台 iPad 的硬约束

**iPad 6 = A10 + 2 GB**。而 WebView 的**内容进程**有独立的内存上限。
**内容进程被 iOS 杀掉 → 页面自动重载 → 表现为「闪退回大厅」（App 不退出）**。

### 已修的最大炸弹（补丁 12）

十周年UI 的 `animationlist.js` 会**开机预加载 46 个骨骼并常驻内存**，
实测**解码后合计约 709 MB**：

| 骨骼 | 解码后内存 |
|---|---|
| `SS_ShiWeiYanSkill` | **306.7 MB** |
| `SS_SWY_yinzhan` | 39.6 MB |
| `SS_SWY_tongchang` | 39.7 MB |
| `effect_youxikaishi_shousha` | 22.8 MB |
| `effect_shoujidonghua` | 18.5 MB |
| …其余 41 个… | … |

**处理**：清空预加载列表 + 让 `playSpine` **按需加载 + 加载完成后自动重播**。
→ 动画仍在，但内存只占本局实际用到的部分。**修完后用户长局顺利打完** ✅

### 判断"是内存还是报错"的方法

| 现象 | 结论 |
|---|---|
| **App 退出到 iPad 桌面** | 内存（整个 App 被 Jetsam 杀掉） |
| **App 没退出，回到游戏大厅** | **WebView 内容进程被杀** → 页面自动重载 |
| 重载前日志**干干净净** | 基本可以断定是内存（系统行为不写日志） |
| 重载前有 `[window.onerror]` | 是报错引起的 |

### 还想再省内存的候选

1. **删掉 `势魏延` 扩展** → 省 300+ MB（`SS_ShiWeiYanSkill` 是它独有的）——**先问用户玩不玩这个武将**
2. **删掉 `标记补充`** 目录 → 省 249.7 MB 磁盘（它没启用，纯占地方）
3. **`千幻聆音`（239.7 MB）/ `皮肤切换`（153.9 MB）** → 省内存大，但**会牵动立绘/布局**，见 §9①

---

## 11. 排障速查表

| 用户说 | 先查什么 |
|---|---|
| 「闪退回大厅」 | 内存（§10）；看日志有没有 `[window.onerror]` |
| 「手牌位置错了」 | 先问：是**每次**错还是**概率**错？每次→配置/扩展问题；概率→补丁 11 那类时序 bug |
| 「弹出错误框」 | 看框里的**函数名 + 行号**（弹框有完整栈）→ 多是"过期技能/卡牌" → 加判空（§9④） |
| 「卡住不动」 | 看是不是 `game.pause()` 后没 `resume`（如补丁 8 那种） |
| 「加载失败/黑屏」 | 查 `noname-debug.log` 的最后一个 `deviceready` 之后的部分 |
| 「很卡」 | 先确认 6 个扩展是否仍是最精简；再查内存（§10）；**别去关十周年UI 的特效开关**（§9①） |

### 分析日志的标准流程

```powershell
# 1) 用户把日志放到 C:\Users\ASUS\AppData\Local\Temp\noname-debug.log
# 2) 清点报错
node E:\noname-port\iosport\tools\diag\err-scan.js
# 3) 看每次启动的时间线（能区分"有对局"和"只是重启"）
node E:\noname-port\iosport\tools\diag\timeline.js
```

> **经验**：日志里带**时间戳**、且**行数 70+** 的启动段才进过对局；
> 只有 27~31 行的启动段是"只开了没打"，别拿它下结论。

---

## 12. 仓库与备份纪律

- 游戏数据（`payload/`）**不进仓库** → 所有对游戏数据的修改**必须**固化进 `tools/apply-patches.js`，
  否则换电脑就复现不了。**每加一个补丁都要 `node tools\apply-patches.js` 验证幂等性。**
- 改完 JS 必须 `node --check <file>` 校验语法。
- 提交后 `git push origin main`（注意 `git -c core.autocrlf=false`）。
- **文档同步**：`patches/README.md` 记录了每个补丁的详细原因与回退方法；新增补丁请一并更新。

---

## 13. 本次会话的完整结论（供你快速建立信心）

```
✅ 移植完成度：可正常游玩，且已通过"长局打完"验证
✅ 13 个补丁全部幂等、可重复执行
✅ 全部报错已清点到"每局 2~3 条且全部无害"
⏳ 唯一待办：用户的「动态皮肤包」→ 补齐 dynamicSkin.js → 重新构建 IPA
⚠️ 补皮肤包后要重新验证：布局是否仍正常、内存是否又变紧
```

**祝顺利。遇到新问题，先看 §9（绝对不要做的事）和 §11（排障速查表）。**
