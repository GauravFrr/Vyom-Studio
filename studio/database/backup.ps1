# Backup PostgreSQL to studio/database/backups/
param(
    [string]$Host = "localhost",
    [int]$Port = 5432,
    [string]$User = "vyom",
    [string]$Database = "vyom_studio"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutDir = Join-Path $Root "backups"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$OutFile = Join-Path $OutDir "vyom_studio_$Stamp.sql"

Write-Host "Backing up $Database to $OutFile ..."
$env:PGPASSWORD = "vyom"
& pg_dump -h $Host -p $Port -U $User -d $Database -F p -f $OutFile
if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_dump failed. Install PostgreSQL client tools or run from Docker:"
    Write-Host "  docker exec vyom-postgres pg_dump -U vyom vyom_studio > `"$OutFile`""
    exit 1
}
Write-Host "Done: $OutFile"
