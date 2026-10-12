# 构建与安装

从零到在 iPad 上玩到无名杀，需要四步。全程**不需要 Mac**。

```
① 准备游戏数据（Windows）   → ② 云端构建未签名 IPA（GitHub） 
        → ③ Windows 上签名并安装（Sideloadly） → ④ 首次导入游戏数据（局域网）
```

---

## ① 准备游戏数据（Windows）

```powershell
cd "E:\noname-port\iosport"
powershell -ExecutionPolicy Bypass -File tools\prepare.ps1
```

默认从 `D:\Quark\无名杀（诗筏）.apk` 提取，产出 `payload\game\`（约 2.5 GB / 25,595 个文件）。

APK 在别的位置就加参数：

```powershell
powershell -ExecutionPolicy Bypass -File tools\prepare.ps1 -Apk "D:\其它路径\xxx.apk"
```

**先验证一下（强烈建议，只需要 1 分钟）**：

```powershell
node tools\serve.js
```

浏览器打开 <http://127.0.0.1:8123/>，看到无名杀的模式选择界面就说明数据没问题。
想测真实的 iOS 代码分支，访问 <http://127.0.0.1:8123/?force=ios> ——
它会强制走 `lib.device = 'ios'` 的那条路，和 iPad 上跑的是同一份逻辑。

---

## ② 云端构建未签名 IPA

用 GitHub Actions 的 macOS runner 出包，**不用买 Mac**。

### 2.1 建仓库并上传

在 GitHub 新建一个仓库（空仓库即可，**不要**勾选自动生成 README），
然后在终端里跑一条命令：

```powershell
cd "E:\noname-port\iosport"
powershell -ExecutionPolicy Bypass -File tools\push-github.ps1 -Repo "https://github.com/你的用户名/你的仓库名.git"
```

首次推送会弹出浏览器让你登录 GitHub，登录一次以后就不再需要。

> **公开还是私有？**
> 公开仓库的 Actions 额度免费且不限量；私有仓库免费账号每月 2000 分钟，
> 而 macOS runner 按 **10 倍**计费（一次 6 分钟的构建 ≈ 60 分钟额度），
> 也就是说私有仓库每月大约能跑 30 次。两者都能用。

> 国内访问 github.com 慢或被墙时，可改用 SSH 地址：
> `-Repo "git@github.com:你的用户名/你的仓库名.git"`
> 或改用 Codemagic / Appcircle 等支持免费 macOS 构建的服务。

### 2.2 等构建完成

push 之后 Actions 会自动跑；也可以到仓库的 **Actions → build-ipa → Run workflow** 手动触发。

构建约 5～10 分钟。完成后在 **Artifacts** 里下载：

```
NonameDecade-unsigned-ipa
  ├─ NonameDecade-unsigned.ipa          未签名安装包
  └─ NonameDecade-unsigned.ipa.sha256   校验和
```

把 `.ipa` 解压到你 Windows 上的某个目录。

---

## ③ 签名并安装到 iPad（Windows）

iOS 不允许安装未签名应用，所以要用你的 Apple ID 现场签名。

### 3.1 装前置工具

1. **Sideloadly**：<https://sideloadly.io> （Windows 版，免费）
2. **Apple 设备驱动**：装 Apple 官网的 **iTunes**（**不要**装 Microsoft Store 版），
   或装 **Apple Devices** 应用。装完插上 iPad 能正常识别即可。

### 3.2 打开 iPad 的开发者模式

iOS 17 必须开启，否则装好的 App 一点就闪退：

`设置 → 隐私与安全性 → 开发者模式 → 打开`，然后**重启 iPad** 并确认。

> 如果设置里没有「开发者模式」这一项：先按 3.3 走一遍安装，
> 失败后再回来找，通常就出现了（这是 iOS 的正常行为）。
> 也可以先用数据线连一次装了 Xcode 的电脑来激活该选项。

### 3.3 用 Sideloadly 安装

1. 数据线连接 iPad 和电脑，iPad 上点「信任此电脑」
2. 打开 Sideloadly
3. **IPA 处**拖入 `NonameDecade-unsigned.ipa`
4. **Apple ID 处**填你的 Apple ID（免费账号即可）
5. 点 **Start**，按提示输入 Apple ID 密码（若开了双重验证，用 App 专用密码）
6. 等待签名 + 安装完成

装完后如果首次打开提示**"不受信任的开发者"**：

`设置 → 通用 → VPN与设备管理 → 开发者App → 你的 Apple ID → 信任`

### 3.4 关于签名有效期

| 账号类型 | 有效期 | 限制 |
|---|---|---|
| 免费 Apple ID | **7 天** | 同时最多 3 个自签 App |
| 付费开发者账号（$99/年） | 1 年 | 无此限制，可 TestFlight 分发 |

**过期后**：App 打不开是正常的，**不用重装数据** —— 重新用 Sideloadly
加载同一个 `.ipa` 再 Start 一次即可，游戏存档在 iPad 本地，不会丢。

> 替代工具：**AltStore**（自动 7 天续签，但需要在电脑常驻 AltServer）。

---

## ④ 首次导入游戏数据

游戏本体 2.5 GB，不随 IPA 打包，首次启动时从电脑同步过去。

1. **确保 iPad 和电脑在同一个 Wi-Fi**（同一个路由器 / 同一网段）
2. 电脑上运行：

   ```powershell
   cd "E:\noname-port\iosport"
   node tools\share.js
   ```

   它会扫描游戏目录并打印局域网地址：

   ```
   ==========================================================
     请在 iPad 上的「无名杀十周年版」里填入下面任一地址：

         http://192.168.1.100:8124/

     按 Ctrl+C 结束分发。
   ==========================================================
   ```

3. 打开 iPad 上的 App，把上面的地址填进去，点 **「开始同步」**
4. 进度条走完会自动进入游戏。约 2.5 GB，视网速十几分钟

   > **可以随时中断，再次点「开始同步」会自动续传**（按 `路径+大小` 比对跳过已完成的文件）。

试玩顺序：出现的**模式选择界面**点一下 → 新手向导选「跳过向导」→ 开始游戏。

---

## 调试

| 手段 | 说明 |
|---|---|
| **桌面替身**（主力） | `node tools/serve.js`，浏览器访问 `?force=ios`。和 iPad 上跑同一份垫片代码，改完刷新即可，无需重新打包 |
| **Safari 网页检查器** | 需要一台 Mac。iPad：`设置 → Safari → 高级 → 网页检查器` 打开 |
| **App 内日志** | 电脑上 `node tools\share.js`、`serve.js` 会打印请求；Swift 侧用 `NSLog` 输出到控制台 |

---

## 故障排查

### 构建 / 安装

| 现象 | 处理 |
|---|---|
| Actions 报 `xcodegen: command not found` | 工作流里已自动 `brew install xcodegen`；若失败可本地重跑该步 |
| Actions 报签名相关错误 | 确认工作流保留了 `CODE_SIGNING_ALLOWED=NO`，不要在 project.yml 里填 `DEVELOPMENT_TEAM` |
| Sideloadly 报 `device not detected` | 装 Apple 官网 iTunes；换根数据线/USB 口；重新"信任此电脑" |
| 装完一点就闪退 | **99% 是没开开发者模式**，见 3.2 |
| 提示 `Untrusted Developer` | 设置 → 通用 → VPN与设备管理 → 信任 |
| 提示 `Unable to install ... maximum number of apps` | 免费账号最多 3 个自签 App，删掉其他的 |

### 同步 / 运行

| 现象 | 处理 |
|---|---|
| App 一直连不上电脑 | ① iPad 和电脑是否同一 Wi-Fi（手机热点、访客网络、AP 隔离都不行）；② Windows 防火墙放行 Node（首次运行会弹窗，选**允许专用网络**）；③ 手动把打印出的 IP 逐条试 |
| 同步中断报「有 N 个文件下载失败」 | 直接再点一次「开始同步」，会自动续传缺失文件 |
| 同步完成但进游戏一直卡在加载 | 多等一会儿（首启要加载 70+ 个脚本）；仍不行就删掉 App 的 `noname` 目录重新同步 |
| 想重新同步 | 用 iPad 的「文件」App 打开 **我的 iPad → 无名杀十周年版**，删掉 `noname` 文件夹，重开 App 即可（App 已开启文件共享） |
| 提示「无法启动本地服务」 | App 会依次尝试 26789～26798，全被占用才会报错；重启 iPad 即可 |

### 恢复出厂 / 换设备

`payload/` 和 IPA 都可以重新生成，游戏存档在 iPad 本地。
换 iPad 只需重装 App + 重新同步数据。

---

## 附：不使用云构建（有 Mac 的话）

```bash
brew install xcodegen
cd iosport/ios
xcodegen generate
open NonameDecade.xcodeproj      # 在 Xcode 里选你的 iPad 直接 Run
```

在 Xcode 的 Signing & Capabilities 里选好自己的 Team 即可，无需改 `project.yml`。
