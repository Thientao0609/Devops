$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$evidenceRelative = 'docs/evidence/integration-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$evidenceAbsolute = Join-Path $projectRoot $evidenceRelative
New-Item -ItemType Directory -Force -Path $evidenceAbsolute | Out-Null
$env:EVIDENCE_DIR = './' + $evidenceRelative
$started = (Get-Date).ToUniversalTime().ToString('o')
& docker compose -f compose.yaml -f compose.test.yaml run --rm --no-deps integration-tests *> (Join-Path $evidenceAbsolute 'pytest.log')
$testExit = $LASTEXITCODE
$sourceHashes = @{}
Get-ChildItem -LiteralPath 'services','tests','contracts' -Recurse -File | Where-Object { $_.Extension -in @('.py','.json') } | ForEach-Object { $sourceHashes[$_.FullName.Substring($projectRoot.Length + 1)] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
$metadata = @{ started_at_utc = $started; ended_at_utc = (Get-Date).ToUniversalTime().ToString('o'); commit = 'UNCOMMITTED'; scope = 'Linux application image -> isolated PostgreSQL test DB + RabbitMQ queues + SMTP Mailpit'; exit_code = $testExit; command = 'docker compose -f compose.yaml -f compose.test.yaml run --rm --no-deps integration-tests'; source_sha256 = $sourceHashes }
$metadata | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $evidenceAbsolute 'metadata.json') -Encoding utf8
Get-Content -LiteralPath (Join-Path $evidenceAbsolute 'pytest.log') -Tail 80
Write-Output "Integration evidence: $evidenceRelative; exit=$testExit"
exit $testExit
