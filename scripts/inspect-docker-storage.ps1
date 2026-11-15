param([string]$TargetDisk='D:\DockerData\active\DockerDesktopWSL\disk\docker_data.vhdx')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$sourceDisk='C:\Users\Acer\AppData\Local\Docker\wsl\disk\docker_data.vhdx'
$resolvedTarget=[IO.Path]::GetFullPath($TargetDisk)
if (-not $resolvedTarget.StartsWith('D:\DockerData\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Target must remain inside approved D:\DockerData' }
function Get-DiskLock([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return @{path=$Path;exists=$false;sharing_locked=$false} }
    try {
        $stream=[IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
        $stream.Dispose()
        return @{path=$Path;exists=$true;exclusive_read=$true;sharing_locked=$false}
    } catch {
        $cause=$_.Exception
        while ($null -ne $cause.InnerException) { $cause=$cause.InnerException }
        $code=$cause.HResult -band 0xffff
        return @{path=$Path;exists=$true;exclusive_read=$false;sharing_locked=($code -in @(32,33));error_code=$code}
    }
}
$source=Get-DiskLock $sourceDisk
$target=Get-DiskLock $resolvedTarget
$server=& docker version --format '{{json .Server}}' 2>&1
$engineOk=($LASTEXITCODE -eq 0)
$containers=@()
$volumes=@()
if ($engineOk) {
    $containers=@(& docker ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}')
    $volumes=@(& docker volume ls --format '{{.Name}}')
}
$sourceInactive=(-not $source.exists) -or ($source.exclusive_read -eq $true)
$activeOnD=$engineOk -and $target.sharing_locked -and $sourceInactive
$snapshot=[ordered]@{
    at_utc=(Get-Date).ToUniversalTime().ToString('o')
    status=$(if ($activeOnD) {'D_DISK_LOCK_AND_ENGINE_VERIFIED_STACK_PENDING'} else {'BLOCKED_D_NOT_VERIFIED'})
    scope='Read-only paths/locks and engine inventory; no data removed, no stack health/business claim'
    source=$source;target=$target;engine_available=$engineOk
    containers=$containers;volumes=$volumes
    disk_free_bytes=@{C=(Get-PSDrive C).Free;D=(Get-PSDrive D).Free}
}
$destination=Join-Path $projectRoot ('docs/evidence/docker-active-'+(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ'))
New-Item -ItemType Directory -Path $destination | Out-Null
$snapshot | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $destination 'metadata.json') -Encoding utf8
Write-Output "$($snapshot.status): $destination"
if (-not $activeOnD) { exit 1 }
