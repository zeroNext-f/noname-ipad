<#
  无名杀 iPad 移植 —— 从 APK 提取游戏本体
  ==================================================================
  用法（在 Windows PowerShell 里）：
      cd "路径\iosport"
      powershell -ExecutionPolicy Bypass -File tools\prepare.ps1

  默认：
      输入 APK  : D:\Quark\无名杀（诗筏）.apk
      输出目录  : .\payload\game   （游戏根目录，含 game\game.js）
            .\payload\noname-decade.zip  （中间产物）

  可用参数覆盖：
      -Apk   "D:\path\xxx.apk"
      -Out   "E:\somewhere\payload"
#>

param(
    [string]$Apk = "D:\Quark\无名杀（诗筏）.apk",
    [string]$Out = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$here = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)   # 项目根
if ([string]::IsNullOrWhiteSpace($Out)) { $Out = Join-Path $here "payload" }

if (-not (Test-Path -LiteralPath $Apk)) {
    Write-Host "找不到 APK：$Apk" -ForegroundColor Red
    Write-Host "请用 -Apk 指定无名杀安装包路径。" -ForegroundColor Yellow
    exit 1
}

$zipPath   = Join-Path $Out "noname-decade.zip"
$gameDir   = Join-Path $Out "game"

New-Item -ItemType Directory -Force -Path $Out | Out-Null

# ---------- 1) 从 APK 中取出 assets/noname-decade.zip ----------
if (Test-Path -LiteralPath $zipPath) {
    $mb = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 1)
    Write-Host "[1/2] 已存在游戏包（$mb MB），跳过提取。" -ForegroundColor DarkGray
} else {
    Write-Host "[1/2] 正在从 APK 提取 assets/noname-decade.zip …" -ForegroundColor Cyan
    $zip = [System.IO.Compression.ZipFile]::OpenRead($Apk)
    try {
        $entry = $zip.Entries | Where-Object { $_.FullName -eq 'assets/noname-decade.zip' }
        if (-not $entry) { throw "APK 里没有 assets/noname-decade.zip，可能不是无名杀包。" }
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $zipPath, $true)
        $sw.Stop()
        Write-Host ("      完成：{0} GB，用时 {1}s" -f [math]::Round($entry.Length/1GB,3), [math]::Round($sw.Elapsed.TotalSeconds,1))
    } finally { $zip.Dispose() }
}

# ---------- 2) 解压游戏包 ----------
$marker = Join-Path $gameDir "game\game.js"
if (Test-Path -LiteralPath $marker) {
    Write-Host "[2/2] 游戏目录已存在，跳过解压：$gameDir" -ForegroundColor DarkGray
} else {
    Write-Host "[2/2] 正在解压游戏本体（约 2.5 GB / 2.5 万个文件）…" -ForegroundColor Cyan
    New-Item -ItemType Directory -Force -Path $gameDir | Out-Null
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & tar.exe -xf $zipPath -C $gameDir
    if ($LASTEXITCODE -ne 0) { throw "tar 解压失败（退出码 $LASTEXITCODE）" }
    $sw.Stop()
    Write-Host ("      完成，用时 {0}s" -f [math]::Round($sw.Elapsed.TotalSeconds,1))
}

# ---------- 校验 ----------
if (-not (Test-Path -LiteralPath $marker)) {
    Write-Host "校验失败：解压后没有 game\game.js" -ForegroundColor Red
    exit 1
}
$stat = Get-ChildItem $gameDir -Recurse -File | Measure-Object -Property Length -Sum
Write-Host ""
Write-Host "准备完成 ✓" -ForegroundColor Green
Write-Host ("  游戏目录 : {0}" -f $gameDir)
Write-Host ("  文件数   : {0}" -f $stat.Count)
Write-Host ("  总大小   : {0} GB" -f [math]::Round($stat.Sum/1GB, 2))
Write-Host ""
Write-Host "下一步："
Write-Host "  · 先在电脑上试玩（可选）：  node tools\serve.js   然后浏览器打开 http://127.0.0.1:8123/"
Write-Host "  · 给 iPad 同步数据：        node tools\share.js"
