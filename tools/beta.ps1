param([switch]$Install, [string]$NotesFile)
# A beta for your own devices: the next ":bN" of the current version, as a GitHub pre-release.
#   powershell -ExecutionPolicy Bypass -File tools\beta.ps1 [-Install] [-NotesFile notes.txt]
# -Install puts it on every device adb lists once it's published. See tools\release.ps1.
$ErrorActionPreference = 'Stop'
$args2 = @{ Beta = $true }
if ($Install) { $args2.Install = $true }
if ($NotesFile) { $args2.NotesFile = $NotesFile }
& (Join-Path $PSScriptRoot 'release.ps1') @args2
