<#
  推送工程到 GitHub，触发云端 macOS 构建
  ==================================================================
  用法一（HTTPS，需要 GitHub 的 Personal Access Token 当密码）：
      powershell -ExecutionPolicy Bypass -File tools\push-github.ps1 -Repo "https://github.com/用户名/仓库.git"

  用法二（SSH，推荐：不需要 token，用本机 SSH 密钥）：
      powershell -ExecutionPolicy Bypass -File tools\push-github.ps1 -Ssh -Repo "https://github.com/用户名/仓库.git"
      （-Ssh 会自动把地址转成 git@github.com:用户名/仓库.git）

  SSH 准备工作（只做一次）：
      1. 复制本机公钥：  Get-Content "$env:USERPROFILE\.ssh\id_rsa.pub" | Set-Clipboard
      2. 打开 https://github.com/settings/ssh/new ，粘贴，Add SSH key
      3. 验证：  ssh -T git@github.com   （出现 Hi 用户名! 即成功）
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Repo,

    [string]$Branch = "main",

    [switch]$Ssh
)

$ErrorActionPreference = "Stop"

# 定位项目根目录（本脚本在 tools\ 下）
$here = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $here
Write-Host "项目目录：$here" -ForegroundColor DarkGray

# ---------- 0. 自动把 HTTPS 地址转成 SSH ----------
if ($Ssh -and $Repo -like 'https://github.com/*') {
    $m = [regex]::Match($Repo, 'https://github\.com/(.+?)(?:\.git)?/?$')
    if ($m.Success) {
        $Repo = "git@github.com:" + $m.Groups[1].Value + ".git"
        Write-Host "已转换为 SSH 地址：$Repo" -ForegroundColor DarkGray
    }
}

# ---------- 1. 检查 git 仓库 ----------
if (-not (Test-Path ".git")) {
    Write-Host "这里还不是 git 仓库，正在初始化…" -ForegroundColor Yellow
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
$output = & git push -u origin $Branch 2>&1
$code = $LASTEXITCODE
$output | ForEach-Object { Write-Host "  $_" }

if ($code -ne 0) {
    Write-Host ""
    Write-Host "推送失败。" -ForegroundColor Red
    $text = ($output | Out-String)

    if ($text -match 'Authentication failed|Invalid username or token|could not read Username') {
        Write-Host "原因：认证失败。GitHub 已禁止用账号密码做 Git 操作。" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "解决（二选一）：" -ForegroundColor Cyan
        Write-Host "  【推荐】改用 SSH（不需要 token）："
        Write-Host "     1. Get-Content `"`$env:USERPROFILE\.ssh\id_rsa.pub`" | Set-Clipboard"
        Write-Host "     2. 打开 https://github.com/settings/ssh/new 粘贴，Add SSH key"
        Write-Host "     3. 重新执行： powershell -ExecutionPolicy Bypass -File tools\push-github.ps1 -Ssh -Repo `"$Repo`""
        Write-Host ""
        Write-Host "  【或者】生成 Personal Access Token 当密码："
        Write-Host "     1. https://github.com/settings/tokens/new"
        Write-Host "     2. 勾选 scope: repo ，生成后复制 ghp_ 开头的那串"
        Write-Host "     3. 重新推送，用户名填 GitHub 用户名，密码处粘贴 token"
    }
    elseif ($text -match 'Permission denied \(publickey\)') {
        Write-Host "原因：本机 SSH 公钥没有被 GitHub 认可。" -ForegroundColor Yellow
        Write-Host "请把公钥加到 https://github.com/settings/ssh/new ，然后重试。"
        Write-Host "查看公钥： Get-Content `"`$env:USERPROFILE\.ssh\id_rsa.pub`""
    }
    elseif ($text -match 'Could not resolve host|Failed to connect|Connection timed out|port 443') {
        Write-Host "原因：网络不通。请确认 VPN / 代理已开启，并且覆盖 git 的流量。" -ForegroundColor Yellow
        Write-Host "若代理只在 127.0.0.1:7890，可执行："
        Write-Host "     git config --global http.proxy  http://127.0.0.1:7890"
        Write-Host "     git config --global https.proxy http://127.0.0.1:7890"
    }
    elseif ($text -match 'Repository not found|not found') {
        Write-Host "原因：仓库不存在或名字写错。请先在 GitHub 上创建该仓库。" -ForegroundColor Yellow
    }
    exit 1
}

# ---------- 5. 完成提示 ----------
$web = $Repo -replace '^git@github\.com:', 'https://github.com/' -replace '\.git$', ''
Write-Host ""
Write-Host "推送成功 ✓" -ForegroundColor Green
Write-Host ""
Write-Host "接下来（全部在浏览器里点）：" -ForegroundColor Cyan
Write-Host "  1. 打开 $web/actions"
Write-Host "  2. 等 build-ipa 变成绿色对勾（首次约 5~10 分钟）"
Write-Host "  3. 点进那次运行，页面底部 Artifacts 下载 NonameDecade-unsigned-ipa"
Write-Host "  4. 解压得到 NonameDecade-unsigned.ipa，用 Sideloadly 装到 iPad"
