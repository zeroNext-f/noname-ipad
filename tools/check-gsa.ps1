<#
  无名杀 iPad 移植 —— 苹果认证服务连通性自检
  ==================================================================
  用途：Sideloadly 报 "GSA returned a non-plist response" 时，
        双击 tools\check-gsa.cmd 运行本脚本，看看到底卡在哪一环。

  这个脚本不需要梯子特定的状态，随时都能跑。
#>

$ErrorActionPreference = 'Continue'
function Line($t) { Write-Host $t }
function Head($t) { Write-Host ""; Write-Host "===== $t =====" -ForegroundColor Cyan }

Head "1. Windows 系统代理"
$reg = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
Line ("  ProxyEnable = {0}" -f $reg.ProxyEnable)
Line ("  ProxyServer = {0}" -f $reg.ProxyServer)
if ($reg.ProxyEnable -eq 1) {
    $srv = $reg.ProxyServer
    $port = 7890
    if ($srv -match ':(\d+)$') { $port = [int]$Matches[1] }
    $ok = $false
    $c = New-Object System.Net.Sockets.TcpClient
    try { $ar = $c.BeginConnect('127.0.0.1', $port, $null, $null); if ($ar.AsyncWaitHandle.WaitOne(600)) { $c.EndConnect($ar); $ok = $true } } catch {} finally { $c.Close() }
    if ($ok) { Line ("  -> 代理端口 127.0.0.1:$port 有响应（正常）") }
    else { Line ("  -> 警告：系统代理开着，但 127.0.0.1:$port 没有服务！这会让所有请求失败") -ForegroundColor Yellow }
}

Head "2. 本机代理 / 安全软件进程"
$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'clash|verge|mihomo|v2ray|xray|sing-box|nekoray|QQPCMgr|QQPCTray|Tencent|360|Huorong|hips' }
if ($procs) { $procs | ForEach-Object { Line ("  {0}  (pid {1})" -f $_.ProcessName, $_.Id) } }
else { Line "  （没发现代理/安全软件进程）" }
Line ""
Line "  注意：腾讯电脑管家(QQPCMgr)、360、火绒 等都可能拦截 HTTPS。" -ForegroundColor Yellow
Line "        腾讯电脑管家需要「右键托盘图标 -> 退出」，不是暂停防护。" -ForegroundColor Yellow

Head "3. gsa.apple.com 域名解析"
try {
    Resolve-DnsName gsa.apple.com -Type A -ErrorAction Stop |
        Where-Object { $_.IPAddress } | Select-Object -First 4 |
        ForEach-Object { Line ("  " + $_.IPAddress) }
} catch { Line ("  解析失败: " + $_.Exception.Message) }

Head "4. 直连 gsa.apple.com（这是 Sideloadly 真正要访问的地址）"
$tmp = Join-Path $env:TEMP "gsa_probe.txt"
& curl.exe -s -k --max-time 25 -o $tmp -w "  HTTP状态=%{http_code}   耗时=%{time_total}s   收到字节=%{size_download}`n" https://gsa.apple.com/grandslam/GsService2
Line ""
if (Test-Path $tmp) {
    $body = Get-Content $tmp -Raw -ErrorAction SilentlyContinue
    if ($body) {
        Line "  响应内容前 200 字符："
        Line ("  " + ($body.Substring(0, [Math]::Min(200, $body.Length)) -replace "`r?`n", " "))
    } else { Line "  （响应体为空）" }
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}
Line ""
Line "  判读标准：" -ForegroundColor Cyan
Line "    苹果正常返回   -> 400 / 405 之类（说明链路通，问题在 Sideloadly 侧）"
Line "    返回 503        -> 链路被拦，看下面第 6 步"
Line "    超时 / 连接失败 -> 网络到不了"

Head "5. 对照：www.apple.com（苹果主站）"
& curl.exe -s -o NUL --max-time 15 -w "  HTTP状态=%{http_code}`n" https://www.apple.com

Head "6. 当前出口 IP（判断走的是哪条线路）"
$ip = & curl.exe -s --max-time 15 https://api.ipify.org
Line ("  出口 IP = " + $ip)

Head "完成"
Line "  · 如果第 4 步是 503 或超时，且第 2 步看到腾讯电脑管家 -> 请彻底退出它再试"
Line "  · 也可以换网络：电脑连手机热点（代理全关）重试 Sideloadly"
