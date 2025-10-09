param(
    [string]$InputMidi = "midi/bach_BWV785_TwoTracks.mid",
    [string]$OutputMid = "output/PitchesShouldBeModulo12Equivalent.mid"
)

$ErrorActionPreference = 'Stop'

# Ensure output folder exists
$newOutDir = Split-Path -Parent $OutputMid
if (-not [string]::IsNullOrWhiteSpace($newOutDir) -and -not (Test-Path $newOutDir)) {
    New-Item -ItemType Directory -Force -Path $newOutDir | Out-Null
}

# No environment variables are used; modulo-12 fidelity is enforced by default by the compressor.

# Temp JSON path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$tmpJson = Join-Path $newOutDir ("BWV785-tt-" + $timestamp + ".json")
$logPath = Join-Path $newOutDir ("BWV785-tt-" + $timestamp + ".log")

Write-Host "[RoundTrip] Compressing $InputMidi -> $tmpJson"
# Use Start-Process to avoid PowerShell treating native stderr as an error record
$compressArgs = @('EncodeDecode.js','compress',"$InputMidi", "$tmpJson", '--preserve-tracks')
$errPath = [System.IO.Path]::ChangeExtension($logPath, '.err.log')
$proc = Start-Process -FilePath node -ArgumentList $compressArgs -NoNewWindow -PassThru -Wait -RedirectStandardOutput $logPath -RedirectStandardError $errPath
if (Test-Path $errPath) {
    Add-Content -Path $logPath -Value ("`n=== STDERR ===`n")
    Get-Content $errPath | Add-Content -Path $logPath
    Remove-Item $errPath -Force -ErrorAction SilentlyContinue
}
if ($proc.ExitCode -ne 0) {
    Write-Error "Compression failed (exit $($proc.ExitCode)). See log: $logPath"
}

# Optional: surface first KeyStrict lines
try { Get-Content $logPath | Select-String "KeyStrict" | Select-Object -First 15 | ForEach-Object { $_.Line } } catch { }

# If compression succeeded, decompress to target MID
Write-Host "[RoundTrip] Decompressing $tmpJson -> $OutputMid"
$decompressArgs = @('EncodeDecode.js','decompress',"$tmpJson", "$OutputMid")
$proc2 = Start-Process -FilePath node -ArgumentList $decompressArgs -NoNewWindow -PassThru -Wait
if ($proc2.ExitCode -ne 0) {
    Write-Error "Decompression failed (exit $($proc2.ExitCode))."
}

Write-Host "[RoundTrip] Done. Output: $OutputMid"
