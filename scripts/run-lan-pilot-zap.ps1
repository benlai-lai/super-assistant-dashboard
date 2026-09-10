param(
  [Parameter(Mandatory = $true)][string]$BaseUrl,
  [Parameter(Mandatory = $true)][string]$ZapCommand,
  [Parameter(Mandatory = $true)][string]$ReportRoot
)
$ErrorActionPreference = 'Stop'
if ($BaseUrl -ne $BaseUrl.Trim()) { throw 'ZAP Phase A target must not contain surrounding whitespace.' }
$uri = [Uri]$BaseUrl
if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'http' -or $uri.Host -ne '127.0.0.1' -or
  $uri.Port -lt 1024 -or $uri.AbsolutePath -ne '/' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) {
  throw 'ZAP Phase A target must be an explicit http://127.0.0.1:<port>/ origin.'
}
if (-not (Test-Path -LiteralPath $ZapCommand -PathType Leaf)) { throw 'ZAP command is missing.' }
if (-not [IO.Path]::IsPathFullyQualified($ReportRoot)) { throw 'ZAP report root must be absolute.' }
if ((Test-Path -LiteralPath $ReportRoot) -and @(Get-ChildItem -LiteralPath $ReportRoot -Force).Count -ne 0) {
  throw 'ZAP report root must be new or empty.'
}
$resolvedReportRoot = [IO.Path]::GetFullPath($ReportRoot)
$zapHome = Join-Path $resolvedReportRoot 'zap-home'
$reportDirectory = Join-Path $resolvedReportRoot 'reports'
New-Item -ItemType Directory -Path $zapHome,$reportDirectory -Force | Out-Null
$plan = Join-Path $PSScriptRoot '..\security\zap\lan-write-pilot.yaml'
$previousBaseUrl = $env:DASHBOARD_ZAP_BASE_URL
$previousReportDirectory = $env:DASHBOARD_ZAP_REPORT_DIR
try {
  $env:DASHBOARD_ZAP_BASE_URL = $uri.GetLeftPart([UriPartial]::Authority)
  $env:DASHBOARD_ZAP_REPORT_DIR = $reportDirectory
  & $ZapCommand -cmd -silent -autorun $plan -dir $zapHome
  if ($LASTEXITCODE -ne 0) { throw "ZAP passive plan failed with exit code $LASTEXITCODE" }
  $reportPath = Join-Path $reportDirectory 'lan-write-pilot-passive.json'
  if (-not (Test-Path -LiteralPath $reportPath -PathType Leaf)) {
    throw 'ZAP passive plan did not produce the required JSON report.'
  }
  Write-Output "report_path=$reportPath"
} finally {
  $env:DASHBOARD_ZAP_BASE_URL = $previousBaseUrl
  $env:DASHBOARD_ZAP_REPORT_DIR = $previousReportDirectory
}
