$ErrorActionPreference = "Stop"

$port = 4188
$version = "p2v-visual-system-refresh-20260628"
$url = "http://127.0.0.1:$port/?v=$version#/routes"

Write-Host "泉游记本地预览启动中..."
Write-Host "项目地址：$PSScriptRoot"
Write-Host "预览地址：$url"
Write-Host ""
Write-Host "如果端口被占用，请修改 start.ps1 中的 `$port。"
Write-Host "按 Ctrl + C 可停止服务。"
Write-Host ""

Set-Location -LiteralPath $PSScriptRoot
python -m http.server $port

