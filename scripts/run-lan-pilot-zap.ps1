param(
  [Parameter(Mandatory = $true)][string]$BaseUrl,
  [Parameter(Mandatory = $true)][string]$ZapCommand,
  [Parameter(Mandatory = $true)][string]$ReportRoot
)
$ErrorActionPreference = 'Stop'
$uri = [Uri]$BaseUrl
if ($uri.Scheme -ne 'http' -or $uri.Host -ne '127.0.0.1' -or $uri.Port -lt 1024 -or $uri.AbsolutePath -ne '/') {
  throw 'ZAP Phase A target must be an explicit http://127.0.0.1:<port>/ origin.'
}
if (-not (Test-Path -LiteralPath $ZapCommand -PathType Leaf)) { throw 'ZAP command is missing.' }
New-Item -ItemType Directory -Path $ReportRoot -Force | Out-Null
$env:DASHBOARD_ZAP_BASE_URL = $BaseUrl.TrimEnd('/')
$plan = Join-Path $PSScriptRoot '..\security\zap\lan-write-pilot.yaml'
& $ZapCommand -cmd -autorun $plan -dir $ReportRoot
if ($LASTEXITCODE -notin @(0, 2)) { throw "ZAP passive plan failed with exit code $LASTEXITCODE" }
