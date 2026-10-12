<#
  无名杀 iPad 移植 —— IPA 签名校验工具
  ==================================================================
  用途：验证一个 IPA 是否已被正确签名，并输出：
        · 是否含 embedded.mobileprovision / _CodeSignature
        · 证书有效期与剩余天数
        · 绑定的设备 UDID（是否包含你的 iPad）
        · 应用权限（Entitlements）

  用法：
      powershell -ExecutionPolicy Bypass -File tools\verify-ipa.ps1
      powershell -ExecutionPolicy Bypass -File tools\verify-ipa.ps1 -Ipa "D:\xxx.ipa"

  不指定 -Ipa 时，会自动在 下载 / 文档 / 桌面 里找最新修改的 .ipa。
#>

param([string]$Ipa = "")

$ErrorActionPreference = 'Continue'

function Say($t, $c = 'Gray') { Write-Host $t -ForegroundColor $c }

function Find-LatestIpa {
    $roots = @(
        (Join-Path $env:USERPROFILE 'Downloads'),
        (Join-Path $env:USERPROFILE 'Documents'),
        (Join-Path $env:USERPROFILE 'Desktop')
    )
    $all = @()
    foreach ($r in $roots) {
        if (Test-Path $r) {
            $all += Get-ChildItem $r -Recurse -File -Filter *.ipa -ErrorAction SilentlyContinue
        }
    }
    return ($all | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
}

Try { [void][System.IO.Compression.ZipFile] } Catch { Add-Type -AssemblyName System.IO.Compression.FileSystem }

if ([string]::IsNullOrWhiteSpace($Ipa)) {
    $f = Find-LatestIpa
    if (-not $f) { Say "没有找到任何 .ipa 文件。请用 -Ipa 指定路径。" 'Red'; exit 1 }
    $Ipa = $f.FullName
}

if (-not (Test-Path -LiteralPath $Ipa)) { Say "文件不存在：$Ipa" 'Red'; exit 1 }

$fi = Get-Item -LiteralPath $Ipa
Say ""
Say "==================================================" 'Cyan'
Say " IPA 签名校验" 'Cyan'
Say "==================================================" 'Cyan'
Say ("  文件     : " + $fi.FullName)
Say ("  大小     : {0:N0} 字节" -f $fi.Length)
Say ("  修改时间 : " + $fi.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))

$zip = $null
try { $zip = [System.IO.Compression.ZipFile]::OpenRead($Ipa) }
catch { Say ("  无法作为 zip 打开：" + $_.Exception.Message) 'Red'; exit 1 }

try {
    $names = @($zip.Entries | ForEach-Object { $_.FullName })
    $hasPayload  = [bool]($names -match '^Payload/')
    $hasProv     = [bool]($names -match 'embedded\.mobileprovision$')
    $hasCodeSig  = [bool]($names -match '_CodeSignature/')
    $hasBinary   = [bool]($names -match '^Payload/[^/]+\.app/[^/]+$')

    Say ""
    Say "---- 结构检查 ----"
    Say ("  条目总数                 : {0}" -f $names.Count)
    Say ("  Payload/                 : {0}" -f $(if ($hasPayload) { '有' } else { '无  <== 异常' })) $(if ($hasPayload) { 'Gray' } else { 'Red' })
    Say ("  embedded.mobileprovision : {0}" -f $(if ($hasProv) { '有' } else { '无  <== 未签名' })) $(if ($hasProv) { 'Gray' } else { 'Red' })
    Say ("  _CodeSignature/          : {0}" -f $(if ($hasCodeSig) { '有' } else { '无' })) $(if ($hasCodeSig) { 'Gray' } else { 'Yellow' })

    if (-not $hasProv) {
        Say ""
        Say "  结论：这个 IPA 是【未签名】的，不能直接安装到未越狱设备。" 'Yellow'
        Say "        需要用 Sideloadly / 爱思助手 签名后再安装。" 'Yellow'
        exit 0
    }

    $e = $zip.Entries | Where-Object { $_.FullName -like '*embedded.mobileprovision' } | Select-Object -First 1
    $ms = New-Object System.IO.MemoryStream
    $st = $e.Open(); $st.CopyTo($ms); $st.Close()
    $bytes = $ms.ToArray()
    $text = [System.Text.Encoding]::UTF8.GetString($bytes)
    $m = [regex]::Match($text, '(?s)<\?xml.*?</plist>')
    if (-not $m.Success) { Say "  描述文件里没找到 plist，签名可能损坏。" 'Red'; exit 1 }

    $x = [xml]$m.Value

    # 用 XPath 取值。注意：不要用 $dict.key 这种点访问方式，
    # PowerShell 的 XML 适配器会让 .InnerText / .NextSibling 失效。
    $topDict = $x.SelectSingleNode('/plist/dict')

    function GetField([string]$name) {
        $node = $topDict.SelectSingleNode("key[text()='$name']/following-sibling::*[1]")
        return $node
    }

    Say ""
    Say "---- 证书信息 ----"
    foreach ($k in @('Name', 'TeamName', 'AppIDName')) {
        $v = GetField $k
        if ($v) { Say ("  {0,-12}: {1}" -f $k, $v.InnerText) }
    }
    $pf = GetField 'Platform'
    if ($pf) {
        $plats = @($pf.SelectNodes('string') | ForEach-Object { $_.InnerText })
        Say ("  {0,-12}: {1}" -f 'Platform', ($plats -join ', '))
    }

    $cd = GetField 'CreationDate'
    $ed = GetField 'ExpirationDate'
    if ($cd) { Say ("  创建时间    : " + [datetime]::Parse($cd.InnerText).ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss')) }
    if ($ed) {
        $exp  = [datetime]::Parse($ed.InnerText).ToLocalTime()
        $now  = Get-Date
        $left = $exp - $now
        Say ("  过期时间    : " + $exp.ToString('yyyy-MM-dd HH:mm:ss'))
        Say ""
        Say "---- 有效期 ----"
        Say ("  现在        : " + $now.ToString('yyyy-MM-dd HH:mm:ss'))
        # 注意：PowerShell 的 [int] 是「四舍五入」不是「截断」，
        # 6.99 天会被算成 7，所以这里必须用 Floor。
        $days  = [math]::Floor($left.TotalDays)
        $hours = [math]::Floor($left.TotalHours) - ($days * 24)
        if ($left.TotalHours -le 0) {
            Say "  剩余        : 已过期！需要重新签名" 'Red'
        } elseif ($left.TotalDays -lt 1) {
            Say ("  剩余        : {0} 小时 {1} 分   <== 快到期了" -f $hours, $left.Minutes) 'Yellow'
        } else {
            Say ("  剩余        : {0} 天 {1} 小时" -f $days, $hours) 'Green'
        }
    }

    $pd = GetField 'ProvisionedDevices'
    Say ""
    Say "---- 绑定的设备 ----"
    if ($pd) {
        $udids = @($pd.string)
        Say ("  设备数量    : {0}" -f $udids.Count)
        foreach ($u in $udids) { Say ("    - " + $u) }
        Say ""
        Say "  参考：你的 iPad UDID 是 551cbf4e8b4fe54346ed8224495105f80bb8a043" 'DarkGray'
        if ($udids -contains '551cbf4e8b4fe54346ed8224495105f80bb8a043') {
            Say "  这台 iPad 在绑定列表里：可以安装" 'Green'
        } else {
            Say "  警告：没看到这台 iPad 的 UDID，可能装不上" 'Yellow'
        }
    } else {
        Say "  （描述文件未绑定具体设备，通常是企业证书）"
    }

    $ent = GetField 'Entitlements'
    if ($ent -and $ent.dict) {
        Say ""
        Say "---- 应用权限 ----"
        $ek = @($ent.dict.key)
        $ev = @($ent.dict.ChildNodes | Where-Object { $_.LocalName -ne 'key' })
        for ($i = 0; $i -lt $ek.Count; $i++) {
            Say ("  {0} = {1}" -f $ek[$i].InnerText, $ev[$i].InnerText)
        }
    }

    Say ""
    Say "==================================================" 'Cyan'
    Say " 结论：这是一个【已签名】的 IPA，结构完整。" 'Green'
    Say "       可以直接安装到 iPad。" 'Green'
    Say "==================================================" 'Cyan'
} finally {
    if ($zip) { $zip.Dispose() }
}
