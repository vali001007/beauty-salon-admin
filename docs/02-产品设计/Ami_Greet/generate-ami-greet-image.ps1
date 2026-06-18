$ErrorActionPreference = "Stop"

$authPath = Join-Path $env:USERPROFILE ".codex\auth.json"
$promptPath = Join-Path $PSScriptRoot "ami-greet-tech-minimal-three-view-prompt.md"
$outPath = Join-Path $PSScriptRoot "ami-greet-tech-minimal-three-view.png"

$auth = Get-Content -LiteralPath $authPath -Raw | ConvertFrom-Json
$prompt = Get-Content -LiteralPath $promptPath -Raw

$headers = @{
  "Content-Type" = "application/json"
  "Authorization" = "Bearer $($auth.OPENAI_API_KEY)"
}

$body = @{
  model = "gpt-image-2"
  prompt = $prompt
  size = "16:9"
  quality = "high"
} | ConvertTo-Json -Depth 8

Write-Host "Creating image task..."
$create = Invoke-RestMethod `
  -Method Post `
  -Uri "https://api.aicodewith.com/v1/images/generations" `
  -Headers $headers `
  -Body $body `
  -TimeoutSec 120

$taskId = $create.id
if (-not $taskId) { $taskId = $create.task_id }
if (-not $taskId) { $taskId = $create.taskId }
if (-not $taskId -and $create.data) { $taskId = $create.data.id }
if (-not $taskId -and $create.data) { $taskId = $create.data.task_id }
if (-not $taskId -and $create.data) { $taskId = $create.data.taskId }

if (-not $taskId) {
  Write-Host "Create response did not include a task id:"
  $create | ConvertTo-Json -Depth 10
  exit 1
}

Write-Host "Task id: $taskId"

$final = $null
for ($i = 1; $i -le 80; $i++) {
  Start-Sleep -Seconds 5
  $status = Invoke-RestMethod `
    -Method Get `
    -Uri "https://api.aicodewith.com/v1/tasks/$taskId" `
    -Headers @{ "Authorization" = "Bearer $($auth.OPENAI_API_KEY)" } `
    -TimeoutSec 60

  $state = $status.status
  if (-not $state -and $status.data) { $state = $status.data.status }
  if (-not $state) { $state = $status.state }
  if (-not $state -and $status.data) { $state = $status.data.state }
  Write-Host "Poll ${i}: $state"
  $final = $status

  if ($state -in @("succeeded", "success", "completed", "complete", "done", "finished")) {
    break
  }
  if ($state -in @("failed", "error", "cancelled", "canceled")) {
    $status | ConvertTo-Json -Depth 10
    exit 1
  }
}

$json = $final | ConvertTo-Json -Depth 20

$urlMatches = [regex]::Matches($json, "https?://[^`"'\s]+?\.(png|jpg|jpeg|webp)(\?[^`"'\s]+)?")
if ($urlMatches.Count -gt 0) {
  $url = $urlMatches[0].Value
  Write-Host "Downloading image..."
  Invoke-WebRequest -Uri $url -OutFile $outPath -TimeoutSec 300
  Write-Host "Saved: $outPath"
  exit 0
}

$b64Matches = [regex]::Matches($json, '"(?:b64_json|base64|image_base64)"\s*:\s*"([^"]+)"')
if ($b64Matches.Count -gt 0) {
  $b64 = $b64Matches[0].Groups[1].Value
  $b64 = $b64 -replace '^data:image/[a-zA-Z0-9+.-]+;base64,', ''
  [IO.File]::WriteAllBytes($outPath, [Convert]::FromBase64String($b64))
  Write-Host "Saved: $outPath"
  exit 0
}

Write-Host "No image URL or base64 field found. Final response:"
$final | ConvertTo-Json -Depth 20
exit 1
