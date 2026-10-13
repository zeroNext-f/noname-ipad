# 对原版游戏数据的补丁

本目录记录移植过程中对**游戏本体数据**（`payload/game/`）做的修改。
这些修改是必要的，因为原数据是为**安卓 App** 写的。

---

## 补丁 1：扩展「如真似幻」的启动跳转（2026-10-13）

**文件**：`extension/如真似幻/js/rzsh.js`
**备份**：`rzsh.js.orig`（修改前的原文件）

### 问题

该扩展是手杀风格的**自定义大厅首页**，游戏启动后会被它劫持到大厅页；
大厅里的「开始游戏」「单机」按钮需要跳回游戏入口。

但它的跳转目标被**写死成安卓专用路径**：

```js
var li1mgmx0Ig = "../../../index.html";
(function () {
  var c = localStorage.getItem("noname_inited");
  c && c !== "nodejs" && (
    li1mgmx0Ia = c,
    li1mgmx0IA = "extension/如真似幻/",
    li1mgmx0Ig = "file:///android_asset/www/index.html"    // ← 安卓 WebView 专有
  );
})();
```

`file:///android_asset/` 在 iOS 上不存在 → 点击后跳转失败 → **黑屏**。

### 修改

改为**按平台自动选择**，安卓保持原样，其他平台用游戏根地址：

```js
li1mgmx0Ig = /android/i.test(navigator.userAgent)
  ? "file:///android_asset/www/index.html"
  : li1mgmx0Ia + "index.html"
```

其中 `li1mgmx0Ia` 就是 `localStorage.noname_inited`（游戏根 URL，
在 App 里是 `http://127.0.0.1:26789/`），拼接后得到
`http://127.0.0.1:26789/index.html`，正好是我们启动器壳的地址。

### 验证结果（桌面环境实测）

| 变量 | 修改前 | 修改后 |
|---|---|---|
| `li1mgmx0Ig`（跳转目标） | `file:///android_asset/www/index.html` ❌ | `http://127.0.0.1:8123/index.html` ✅ |

同时确认：
- 扩展的防盗版开关 `window.rzsh_anticrack` **硬编码为 false**，不会因改文件而拦截
- `sessionStorage` 里存的是 `as-fantasy-as-real`（正常分支）→ 跳回游戏后**不会**被弹回大厅
- 「开始游戏」和「单机」共用同一个函数，**一次修复同时生效**

### 回退方法

用 `rzsh.js.orig` 覆盖回去即可。

---

## 补丁 2：禁用「更新日志含诗筏即重载」的保护（2026-10-13）

**文件**：`game/game.js`
**备份**：`game.js.orig`

### 问题

游戏启动逻辑里有这段代码：

```js
for (let i = 0; i < lib.changeLog.length; i++) {
    if (lib.changeLog[i].includes(lib.init.decode('6K+X562P'))) { game.reload(); }
}
```

`lib.init.decode('6K+X562P')` 解码结果是 **「诗筏」** —— 这是十周年本体针对
「诗筏」整合包的一个保护，只要更新日志里出现「诗筏」二字就 `game.reload()`。

而 `game.reload()` 的实现是 `window.location.reload()`。整合包里的多个扩展
（Thunder / 十周年UI / 抖音诗筏 / 星霜卓苒 / 标记补充 / 如真似幻 等）都带有含
「诗筏」字样的更新日志，于是 **每次启动都会立刻重载 → 死循环**
（表现为「画面每隔 1~2 分钟闪一下」）。

### 修改

把整个 for 循环体改为空（保留循环结构，避免语法问题）：

```js
for (let i = 0; i < lib.changeLog.length; i++) { /* patched-out by iOS port: ... */ }
```

### 验证

- 补丁后 `node --check game/game.js` 通过 ✅
- 版本检查 `checkVersion` 用的是 `/^\d+\.\d+\.\d+\.\d+_[a-zA-Z0-9αβ]+$/`，
  对 `1.12.7.0711_β` 返回 `true`，**不会**触发另一处 `game.reload()` ✅

### 回退方法

用 `game.js.orig` 覆盖回去即可。

---

## 附：与扩展「如真似幻」相关的三个坑（已全部查明）

| # | 现象 | 原因 | 处理 |
|---|---|---|---|
| 1 | 点「开始游戏」黑屏 | 跳转目标写死成安卓路径 `file:///android_asset/www/index.html` | 补丁 1（改 `rzsh.js`） |
| 2 | 画面每隔 1~2 分钟闪一下 | 「诗筏」重载保护触发死循环 | 补丁 2（改 `game.js`） |
| 3 | 游戏卡在加载画面 / body 被删 | 扩展在**未登录**时执行 `document.body.remove()`（`extension.js` 第 1565 行） | **不需要改代码**：在大厅里填昵称+密码点「登录」即可（写入 `localStorage.loggedIn`） |

> 第 3 条的 `loggedIn` 是**纯本地标记**，密码随便填、不联网验证。
> 但「单机」按钮不会写入它，所以未登录时用「单机」同样会卡住。

---

## ⚠️ 十周年UI 的「特效 / 皮肤」开关——**千万不要调**（2026-10-13 真机实测）

**结论：关掉任何一个，都会同时造成「手牌/武将布局错位」和「更卡」。**

| 配置 | `dynamicSkin` | `outcropSkin` | 结果 |
|---|---|---|---|
| 基线（原始值） | true | true | 布局 ✅ 正常 |
| 变体 A | false | true | 手牌 ❌ 偏移 |
| 变体 B | false | false | 武将 + 牌 ❌ 整体下移，**而且更卡** |

**根本原因**：`extension/十周年UI/extension.js:11288` 会去请求

```js
this.js(decadeUIPath + 'dynamicSkin.js');
```

**但 `dynamicSkin.js` 在这个懒人包里根本不存在**（PC / iPad / D:\Quark 全盘搜索均无）。
模块缺失时这套渲染会走**降级路径**，而它的坐标计算**依赖上述开关的组合**——
「都开」是它唯一能自洽工作的状态。

**同样不能动的还有**：

- `extension_十周年UI_gameAnimationEffect` / `JNTX` / `cardPhantom` / `effect_panding` / `playerDieEffect`
- `extension_千幻聆音_qhly_decadeCloseDynamic` / `decadeChangeEffect` / `decadeDynamic`

改动它们同样会导致**布局出错 + 变慢**（引擎切到降级渲染路径）。
**→ 这些开关一律保持懒人包原始值。**

> **性能只能靠「减少扩展数量」来换，不能靠关这些开关。**

### 扩展加载报错的正确修法

`lib.config` 里 **`extensions` 和 `plays` 两个列表都要**按「实际存在的扩展」过滤：

- `extensions` 里是扩展名
- **`plays` 里是「纯扩展名」**（没有 `mode_extension_` 前缀）

只过滤 `extensions` 会漏掉 `plays`，表现为启动时报
`扩展【AIoptimize】加载失败`。

### 已知但不修的无害项

`loadSpine: [lianzhao_jindu] / [lianzhao_zuowei] 加载失败` —— **每次开局各 2 条**。

- 素材**完整**：JSON 合法（spine 3.7），PNG 实际尺寸与 atlas 声明**完全一致**
- 属运行时加载问题；经统计**每局仅 2 次**，与「响应时卡顿」**无相关性**
- 判定为无害，暂不处理（如需排查，在 `animation.js:588/598` 打印失败路径即可）

