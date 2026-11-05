param(
    # A full release: the new version, MAJOR.MINOR.PATCH, above the one out now (it outranks every beta before it).
    [string]$Version,
    # What's new, one line per change (UTF-8). Required for a release; a beta gets a short default.
    [string]$NotesFile,
    # A beta: the next ":bN" of the current version, published as a GitHub pre-release. Only beta builds look at
    # pre-releases, so it reaches the developer's own devices; the download page and everyone else read "latest".
    [switch]$Beta,
    # Install the finished APK on every device adb lists (your own phone or emulator), after publishing.
    [switch]$Install
)
# Publishes Bloom Planner for Android in one command:
#   powershell -ExecutionPolicy Bypass -File tools\release.ps1 -Version 1.1.0 -NotesFile C:\path\notes.txt
#   powershell -ExecutionPolicy Bypass -File tools\release.ps1 -Beta [-Install]
# Steps: bump app.json (and package.json) and push; build on GitHub Actions (release.yml, with the variant);
# sign the APK here with the release key (unless the repository has the signing secrets, then CI signs and
# publishes it); create the GitHub release. Needs `gh` signed in, and the key and its properties file in
# %USERPROFILE%\.android. This file is ASCII so Windows PowerShell 5 reads it as written.
$ErrorActionPreference = 'Stop'
$repo = 'Howzit5217/bloom-planner'
$root = Split-Path $PSScriptRoot -Parent
$noBom = New-Object System.Text.UTF8Encoding $false
$keyProps = Join-Path $env:USERPROFILE '.android\bloom-planner-signing.properties'
$certPrefix = 'c55a6843'
$buildTools = Join-Path $env:LOCALAPPDATA 'Android\Sdk\build-tools\37.0.0'
$javaHome = Join-Path $env:USERPROFILE '.gradle\jdks\eclipse_adoptium-21-amd64-windows.2'

function Run([string]$exe, [string[]]$argv) {
    & $exe @argv
    if ($LASTEXITCODE -ne 0) { throw "$exe $($argv -join ' ') failed ($LASTEXITCODE)" }
}

Push-Location $root
try {
    if ($Beta -and $Version) { throw 'A beta builds on the current version; leave out -Version.' }
    if (-not $Beta -and -not $Version) { throw 'Give -Version for a release, or -Beta for a test build.' }
    if (-not $Beta -and -not $NotesFile) { throw 'A release needs -NotesFile (what is new, one line per change).' }
    if ($NotesFile -and -not (Test-Path $NotesFile)) { throw "No notes file at $NotesFile" }
    if ((git status --porcelain) -ne $null) { throw 'Commit or stash your changes first; the build is made from what is on GitHub.' }
    if ((git rev-parse --abbrev-ref HEAD).Trim() -ne 'main') { throw 'Switch to the main branch first.' }

    # 1. The version, in app.json (and package.json), committed and pushed so CI builds exactly this.
    $appPath = Join-Path $root 'app.json'
    $app = [System.IO.File]::ReadAllText($appPath)
    if ($app -notmatch '"version":\s*"(\d+\.\d+\.\d+)"') { throw 'No version in app.json' }
    $current = $Matches[1]
    if ($app -notmatch '"beta":\s*(\d+)') { throw 'No extra.beta in app.json' }
    $betaNumber = [int]$Matches[1]
    if ($Beta) {
        $betaNumber++
        $app = $app -replace '"beta":\s*\d+', ('"beta": ' + $betaNumber)
        $shown = "${current}:b$betaNumber"; $tag = "v$current-b$betaNumber"
        $message = "Beta $shown"
    } else {
        if ($Version -notmatch '^\d{1,2}\.\d{1,2}\.\d{1,2}$') { throw 'The version must look like 1.1.0' }
        if ([version]$Version -le [version]$current) { throw "The release must be above $current (betas of $current already rank above $current itself)." }
        $app = $app -replace '"version":\s*"\d+\.\d+\.\d+"', ('"version": "' + $Version + '"')
        $app = $app -replace '"beta":\s*\d+', '"beta": 0'
        $pkgPath = Join-Path $root 'package.json'
        $pkg = [System.IO.File]::ReadAllText($pkgPath) -replace '"version":\s*"\d+\.\d+\.\d+"', ('"version": "' + $Version + '"')
        [System.IO.File]::WriteAllText($pkgPath, $pkg, $noBom)
        $shown = $Version; $tag = "v$Version"
        $message = "Version $Version"
    }
    [System.IO.File]::WriteAllText($appPath, $app, $noBom)
    Run git @('add', 'app.json', 'package.json')
    Run git @('commit', '-m', $message)
    Run git @('push', 'origin', 'main')
    $sha = (git rev-parse HEAD).Trim()

    # 2. The build on GitHub Actions.
    $variant = if ($Beta) { 'beta' } else { 'release' }
    Run gh @('workflow', 'run', 'release.yml', '-R', $repo, '--ref', 'main', '-f', "variant=$variant")
    $runId = $null
    for ($i = 0; $i -lt 30 -and -not $runId; $i++) {
        Start-Sleep -Seconds 4
        $runs = gh run list -R $repo --workflow release.yml --limit 5 --json databaseId,headSha,event | ConvertFrom-Json
        $match = $runs | Where-Object { $_.headSha -eq $sha -and $_.event -eq 'workflow_dispatch' } | Select-Object -First 1
        if ($match) { $runId = $match.databaseId }
    }
    if (-not $runId) { throw 'The build did not start on GitHub.' }
    Write-Host "Building $shown on GitHub (run $runId)..."
    Run gh @('run', 'watch', "$runId", '-R', $repo, '--exit-status')

    # 3. Signed by CI already (the repository has the signing secrets), or signed here with the release key.
    $out = Join-Path $env:TEMP "bloom-release-$tag"
    if (Test-Path $out) { Remove-Item $out -Recurse -Force }
    New-Item -ItemType Directory $out | Out-Null
    $apk = Join-Path $out "BloomPlanner-$tag.apk"
    # "release not found" on stderr is the usual answer here; Windows PowerShell would treat it as fatal.
    $ErrorActionPreference = 'Continue'
    gh release view $tag -R $repo 2>&1 | Out-Null
    $published = $LASTEXITCODE -eq 0
    $ErrorActionPreference = 'Stop'
    if ($published) {
        Run gh @('release', 'download', $tag, '-R', $repo, '-p', '*.apk', '-D', $out)
    } else {
        Run gh @('run', 'download', "$runId", '-R', $repo, '-n', "BloomPlanner-unsigned-$variant", '-D', $out)
        $unsigned = Join-Path $out 'app-release-unsigned.apk'
        $aligned = Join-Path $out 'aligned.apk'
        $props = @{}
        foreach ($line in [System.IO.File]::ReadAllLines($keyProps)) { if ($line -match '^\s*([^#=]+?)\s*=\s*(.*)$') { $props[$Matches[1]] = $Matches[2] } }
        $env:JAVA_HOME = $javaHome
        $env:PATH = (Join-Path $javaHome 'bin') + ';' + $env:PATH
        Run (Join-Path $buildTools 'zipalign.exe') @('-p', '-f', '4', $unsigned, $aligned)
        Run (Join-Path $buildTools 'apksigner.bat') @('sign', '--ks', $props['storeFile'], '--ks-pass', "pass:$($props['storePassword'])", '--ks-key-alias', $props['keyAlias'], '--key-pass', "pass:$($props['keyPassword'])", '--out', $apk, $aligned)
        Remove-Item $unsigned, $aligned
    }
    $certs = & (Join-Path $buildTools 'apksigner.bat') verify --print-certs $apk
    if ($LASTEXITCODE -ne 0) { throw 'The APK does not verify.' }
    $cert = (($certs | Select-String 'SHA-256 digest: ([0-9a-f]+)').Matches[0].Groups[1].Value)
    if (-not $cert.StartsWith($certPrefix)) { throw "Signed with the wrong key ($cert); installed copies could not update." }
    $hash = (Get-FileHash $apk -Algorithm SHA256).Hash.ToLower()

    # 4. The release (when CI didn't publish it already).
    if (-not $published) {
        $lines = if ($NotesFile) { [System.IO.File]::ReadAllLines((Resolve-Path $NotesFile), [System.Text.Encoding]::UTF8) | ForEach-Object { $_.Trim() } | Where-Object { $_ } } else { @('A test build.') }
        $body = @()
        foreach ($l in $lines) { $body += "- $l" }
        $body += ''
        $body += 'Unofficial fan-made planner, not affiliated with Scopely or Nintendo.'
        $body += ''
        $body += "<sub>SHA-256 of BloomPlanner-$tag.apk: ``$hash`` - signing certificate SHA-256: ``$cert``</sub>"
        $notesOut = Join-Path $out 'notes.md'
        [System.IO.File]::WriteAllLines($notesOut, $body, $noBom)
        $create = @('release', 'create', $tag, $apk, '-R', $repo, '--target', $sha, '--title', "Bloom Planner $shown", '--notes-file', $notesOut)
        if ($Beta) { $create += '--prerelease' }
        Run gh $create
        # Creating a release tag starts the tag-triggered build again; this one is already done, so stop it.
        if (-not $Beta) {
            Start-Sleep -Seconds 8
            $dupes = gh run list -R $repo --workflow release.yml --event push --limit 5 --json databaseId,headBranch,status | ConvertFrom-Json
            foreach ($r in ($dupes | Where-Object { $_.headBranch -eq $tag -and $_.status -ne 'completed' })) { gh run cancel $r.databaseId -R $repo | Out-Null }
        }
    }
    Write-Host "Published Bloom Planner $shown ($tag)."

    # 5. Your own devices, only when asked.
    if ($Install) {
        $adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
        $devices = & $adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\tdevice$' } | ForEach-Object { ($_ -split "`t")[0] }
        foreach ($d in $devices) { Write-Host "Installing on $d..."; Run $adb @('-s', $d, 'install', '-r', $apk) }
    }
    Write-Host "APK: $apk"
} finally {
    Pop-Location
}
