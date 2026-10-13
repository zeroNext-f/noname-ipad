# 诊断脚本（`tools/diag/`）

分析 `noname-debug.log` 与调查游戏数据用的**一次性脚本**，都是纯 Node（无依赖）。
**脚本内的路径按需修改**（默认指向本机实际路径）。

| 脚本 | 用途 | 用法 |
|---|---|---|
| `err-scan.js` | **报错清点（首选）**：按"每次启动"分组、去重、统计次数；输出到 `err-scan.txt` | `node tools\diag\err-scan.js` |
| `timeline.js` | 每次启动的时间 + 报错种类 + 是否进过对局 | `node tools\diag\timeline.js` |
| `membudget.js` | 按 atlas 声明的**页面尺寸**估算骨骼解码后的内存（找内存炸弹神器） | `node tools\diag\membudget.js` |
| `preload.js` | 统计 `dcdanimation_list` 预加载列表的条目与贴图体积 | `node tools\diag\preload.js` |
| `reload.js` | 全盘搜索 `game.reload()` / `location.reload()` 的触发点 | `node tools\diag\reload.js` |
| `gen-final2.js` | 按"iPad 实际存在的扩展"生成配置文件（改配置的模板） | `node tools\diag\gen-final2.js` |

## 默认路径

```
日志   C:/Users/ASUS/AppData/Local/Temp/noname-debug.log
游戏数据 E:/noname-port/iosport/payload/game
iPad扩展 C:/Users/ASUS/Documents/Default Project/noname/extension
配置源 C:/Users/ASUS/AppData/Local/Temp/【手杀懒人包 - 数据 - 抖音诗筏】...（原始 base64 配置）
```

## 关键经验

- **UTF-8 输出**：脚本用 `fs.readFileSync(f,'utf8')` / `writeFileSync(...,'utf8')`。
  在 Windows PowerShell 里直接 `node x.js` 打印中文可能乱码 —— **写文件再读**最稳。
- **区分"有对局"和"只是重启"**：日志段**行数 70+** 才进过对局；27~31 行的是"只开了没打"。
- **PowerShell 小坑**：字符串里含中文引号或 `:-` 之类要小心解析；
  `"[$fn:...]"` 会被当成盘符引用，要写 `${fn}`。
- `membudget.js` 的估算口径：atlas 里 `size: W,H` 且 W,H ≥ 256 视为**页面尺寸**，
  按 `W×H×4` 字节计（RGBA8888）——**偏保守但足够用来找"异常大的那个"**。
