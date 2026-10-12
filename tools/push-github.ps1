<#
  推送工程到 GitHub，触发云端 macOS 构建
  ==================================================================
  用法（在项目根目录，或在任意位置用绝对路径调用）：

      cd "E:\noname-port\iosport"
      powershell -ExecutionPolicy Bypass -File tools\push-github.ps1 -Repo "https://github.com/你的用户名/noname-ipad.git"

  说明：
    · 首次推送会弹出 GitHub 登录窗口（浏览器授权），登录一次以后就不用再登。
    · 推完后去仓库的 Actions 页面等 build-ipa 跑完，在 Artifacts 下载 IPA。
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Repo,

    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

# 定位项目根目录（本脚本在 tools\ 下）
$here = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $here

Write-Host "项目目录：$here" -ForegroundColor DarkGray

# ---------- 1. 检查 git 仓库 ----------
if (-not (Test-Path ".git")) {
    Write-Host "这里还不是 git 仓库。正在初始化…" -ForegroundColor Yellow
    git init -q
    git branch -M $Branch
}

# ---------- 2. 检查/设置 remote ----------
$remotes = @(git remote 2>$null)
if ($remotes -contains "origin") {
    git remote set-url origin $Repo
    Write-Host "已更新 origin -> $Repo"
} else {
    git remote add origin $Repo
    Write-Host "已添加 origin -> $Repo"
}

# ---------- 3. 提交未保存的改动 ----------
git add -A
$pending = git status --porcelain
if ($pending) {
    $msg = "更新：$(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    git commit -q -m $msg
    Write-Host "已提交本地改动（$msg）"
} else {
    Write-Host "没有需要提交的改动"
}

# ---------- 4. 推送 ----------
Write-Host ""
Write-Host "正在推送 $Branch 到 GitHub …" -ForegroundColor Cyan
Write-Host "（首次会弹浏览器要求登录 GitHub，登录一次即可）" -ForegroundColor DarkGray
git push -u origin $Branch

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "推送失败。" -ForegroundColor Red
    Write-Host "常见原因：" -ForegroundColor Yellow
    Write-Host "  · 仓库地址写错（注意结尾 .git）"
    Write-Host "  · 还没在 GitHub 上创建这个仓库"
    Write-Host "  · 网络无法访问 github.com（可改用 SSH 地址 git@github.com:用户/仓库.git）"
    exit 1
}

# ---------- 5. 完成提示 ----------
$web = $Repo -replace '\.git$', ''
Write-Host ""
Write-Host "推送成功 ✓" -ForegroundColor Green
Write-Host ""
Write-Host "接下来（全部在浏览器里点）：" -ForegroundColor Cyan
Write-Host "  1. 打开 $web/actions"
Write-Host "  2. 等 build-ipa 变成绿色对勾（首次约 5~10 分钟）"
Write-Host "  3. 点进那次运行，页面底部 Artifacts 下载 NonameDecade-unsigned-ipa"
Write-Host "  4. 解压得到 NonameDecade-unsigned.ipa，用 Sideloadly 装到 iPad"
