[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('pack', 'inspect', 'validate', 'install', 'list')]
    [string]$Command = 'list',

    [string]$SourcePath,
    [string]$PluginPath,
    [string]$ProjectPath = (Get-Location).Path,
    [string]$OutputPath,
    [switch]$Apply,
    [switch]$Force,
    [switch]$Json,
    [ValidateSet('fail', 'skip', 'overwrite', 'side-by-side')]
    [string]$Conflict = 'fail'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:PluginToolVersion = '0.5.0'

function Resolve-FullPath {
    param([Parameter(Mandatory)][string]$Path)
    if (Test-Path -LiteralPath $Path) { return (Resolve-Path -LiteralPath $Path).Path }
    return [IO.Path]::GetFullPath($Path)
}

function Get-Sha256 {
    param([Parameter(Mandatory)][string]$Path)
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Get-BytesSha256 {
    param([Parameter(Mandatory)][byte[]]$Bytes)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}

function Get-RelativePath {
    param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][string]$Path)
    $prefix = $Root.TrimEnd('\') + '\'
    if (-not $Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "路径不在插件根目录内：$Path" }
    return $Path.Substring($prefix.Length).Replace('\', '/')
}

function Test-SafePackagePath {
    param([Parameter(Mandatory)][string]$PackagePath)
    $path = $PackagePath.Replace('\', '/')
    if ([string]::IsNullOrWhiteSpace($path) -or $path.StartsWith('/') -or $path -match '^[A-Za-z]:') { return $false }
    if ($path -match '(^|/)\.\.(/|$)' -or $path -match '(^|/)\.$') { return $false }
    return ($path -eq 'plugin.json' -or $path -eq 'README.md' -or $path -like 'skills/*' -or $path -like 'rules/*' -or $path -like 'mcp/*' -or $path -like 'bin/*' -or $path -like 'assets/*')
}

function Get-PluginMetadata {
    param([Parameter(Mandatory)][string]$Root)
    $manifestPath = Join-Path $Root '.trae-plugin\plugin.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "插件源目录缺少 .trae-plugin\plugin.json：$Root" }
    $metadata = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
    foreach ($field in @('id', 'name', 'version')) {
        if ([string]::IsNullOrWhiteSpace([string]$metadata.$field)) { throw "plugin.json 缺少必填字段：$field" }
    }
    if ([string]$metadata.id -notmatch '^[a-z0-9][a-z0-9._-]{2,63}$') { throw "插件 id 不符合规范：$($metadata.id)" }
    return $metadata
}

function Get-SourceRecords {
    param([Parameter(Mandatory)][string]$Root)
    $records = [System.Collections.Generic.List[object]]::new()
    $manifestPath = Join-Path $Root '.trae-plugin\plugin.json'
    $manifest = Get-Item -LiteralPath $manifestPath
    [void]$records.Add([pscustomobject]@{ sourcePath = $manifest.FullName; packagePath = 'plugin.json'; size = [int64]$manifest.Length; sha256 = Get-Sha256 -Path $manifest.FullName })
    Get-ChildItem -LiteralPath $Root -Recurse -File -Force | ForEach-Object {
        if ($_.FullName -eq $manifest.FullName) { return }
        $relative = Get-RelativePath -Root $Root -Path $_.FullName
        if ($relative -like '.trae-plugin/*') { return }
        if (-not (Test-SafePackagePath -PackagePath $relative)) { throw "插件文件必须位于 skills、rules、mcp、bin、assets 或根目录 README：$relative" }
        [void]$records.Add([pscustomobject]@{ sourcePath = $_.FullName; packagePath = $relative; size = [int64]$_.Length; sha256 = Get-Sha256 -Path $_.FullName })
    }
    return @($records | Sort-Object packagePath -Unique)
}

function Find-Secrets {
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Records)
    $findings = [System.Collections.Generic.List[object]]::new()
    $patterns = @(
        @{ Name = 'private-key'; Regex = '-----BEGIN (RSA|OPENSSH|EC|DSA|PRIVATE) KEY-----' },
        @{ Name = 'credential-assignment'; Regex = '(?i)(api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|secret)\s*["'']?\s*[:=]\s*["'']?[^\s"'']{12,}' },
        @{ Name = 'bearer-token'; Regex = '(?i)\bBearer\s+[A-Za-z0-9._\-/+=]{20,}' },
        @{ Name = 'openai-like-key'; Regex = '\bsk-[A-Za-z0-9_-]{16,}\b' }
    )
    foreach ($record in $Records) {
        if ($record.size -gt 2MB) { continue }
        try { $content = Get-Content -Raw -LiteralPath $record.sourcePath -ErrorAction Stop } catch { continue }
        $lineNumber = 0
        foreach ($line in ($content -split "`r?`n")) {
            $lineNumber++
            foreach ($pattern in $patterns) {
                if ($line -match $pattern.Regex) {
                    [void]$findings.Add([pscustomobject]@{ path = $record.packagePath; line = $lineNumber; kind = $pattern.Name; redacted = $true })
                }
            }
        }
    }
    return @($findings)
}

function Add-ZipFile {
    param([Parameter(Mandatory)][System.IO.Compression.ZipArchive]$Archive, [Parameter(Mandatory)][string]$EntryName, [Parameter(Mandatory)][string]$SourcePath)
    $entry = $Archive.CreateEntry($EntryName, [IO.Compression.CompressionLevel]::Optimal)
    $input = [IO.File]::OpenRead($SourcePath)
    $output = $entry.Open()
    try { $input.CopyTo($output) } finally { $output.Dispose(); $input.Dispose() }
}

function Add-ZipText {
    param([Parameter(Mandatory)][System.IO.Compression.ZipArchive]$Archive, [Parameter(Mandatory)][string]$EntryName, [Parameter(Mandatory)][string]$Content)
    $entry = $Archive.CreateEntry($EntryName, [IO.Compression.CompressionLevel]::Optimal)
    $output = $entry.Open()
    $writer = [IO.StreamWriter]::new($output, [Text.UTF8Encoding]::new($false))
    try { $writer.Write($Content) } finally { $writer.Dispose(); $output.Dispose() }
}

function New-PluginManifest {
    param([Parameter(Mandatory)][object]$Metadata, [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Records, [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Findings)
    $manifest = $Metadata | ConvertTo-Json -Depth 20 | ConvertFrom-Json
    $manifest | Add-Member -NotePropertyName schemaVersion -NotePropertyValue 1 -Force
    $manifest | Add-Member -NotePropertyName generatedBy -NotePropertyValue "TraeForge Plugin Tool $script:PluginToolVersion" -Force
    $manifest | Add-Member -NotePropertyName safety -NotePropertyValue ([pscustomobject]@{ secretScanPassed = ($Findings.Count -eq 0); findings = @($Findings) }) -Force
    $manifest | Add-Member -NotePropertyName files -NotePropertyValue @($Records | Where-Object { $_.packagePath -ne 'plugin.json' -and $_.packagePath -ne 'README.md' } | ForEach-Object { [pscustomobject]@{ packagePath = $_.packagePath; size = $_.size; sha256 = $_.sha256 } }) -Force
    return $manifest
}

function Pack-Plugin {
    param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][string]$Destination)
    $metadata = Get-PluginMetadata -Root $Root
    $records = @(Get-SourceRecords -Root $Root)
    $findings = @(Find-Secrets -Records $records)
    if ($findings.Count -gt 0) { throw "发现 $($findings.Count) 个疑似敏感信息，已阻止插件导出。" }
    if ((Test-Path -LiteralPath $Destination) -and -not $Force) { throw "输出文件已存在：$Destination。请使用 -Force 才能覆盖。" }
    $manifest = New-PluginManifest -Metadata $metadata -Records $records -Findings $findings
    $readmePath = Join-Path $Root 'README.md'
    $readme = if (Test-Path -LiteralPath $readmePath) { Get-Content -Raw -LiteralPath $readmePath } else { "# $($metadata.name)`n`n$($metadata.description)`n" }
    $parent = Split-Path -Parent $Destination
    if (-not [string]::IsNullOrWhiteSpace($parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    $stream = [IO.File]::Open($Destination, [IO.FileMode]::Create, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        Add-ZipText -Archive $archive -EntryName 'plugin.json' -Content ($manifest | ConvertTo-Json -Depth 20)
        Add-ZipText -Archive $archive -EntryName 'README.md' -Content $readme
        foreach ($record in $records) {
            if ($record.packagePath -eq 'plugin.json' -or $record.packagePath -eq 'README.md') { continue }
            Add-ZipFile -Archive $archive -EntryName $record.packagePath -SourcePath $record.sourcePath
        }
    } finally { $archive.Dispose(); $stream.Dispose() }
    Write-Output "已导出插件：$Destination"
}

function Read-PluginManifest {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "找不到插件包：$Path" }
    $archive = [IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $entry = $archive.GetEntry('plugin.json')
        if ($null -eq $entry) { throw '插件包缺少 plugin.json' }
        $reader = [IO.StreamReader]::new($entry.Open())
        try { return ($reader.ReadToEnd() | ConvertFrom-Json) } finally { $reader.Dispose() }
    } finally { $archive.Dispose() }
}

function Get-PackEntryBytes {
    param([Parameter(Mandatory)][System.IO.Compression.ZipArchive]$Archive, [Parameter(Mandatory)][string]$EntryName)
    $entry = $Archive.GetEntry($EntryName)
    if ($null -eq $entry) { throw "插件包缺少文件：$EntryName" }
    $input = $entry.Open()
    $memory = [IO.MemoryStream]::new()
    try { $input.CopyTo($memory); return $memory.ToArray() } finally { $memory.Dispose(); $input.Dispose() }
}

function Validate-Plugin {
    param([Parameter(Mandatory)][string]$Path)
    $errors = [System.Collections.Generic.List[string]]::new()
    $manifest = $null
    try { $manifest = Read-PluginManifest -Path $Path } catch { [void]$errors.Add($_.Exception.Message) }
    if ($null -eq $manifest) { return [pscustomobject]@{ valid = $false; pluginPath = $Path; errors = @($errors) } }
    foreach ($field in @('id', 'name', 'version')) { if ([string]::IsNullOrWhiteSpace([string]$manifest.$field)) { [void]$errors.Add("plugin.json 缺少必填字段：$field") } }
    $archive = $null
    try {
        $archive = [IO.Compression.ZipFile]::OpenRead($Path)
        foreach ($file in @($manifest.files)) {
            $packagePath = [string]$file.packagePath
            if (-not (Test-SafePackagePath -PackagePath $packagePath)) { [void]$errors.Add("不安全的插件路径：$packagePath"); continue }
            try {
                $bytes = Get-PackEntryBytes -Archive $archive -EntryName $packagePath
                if ((Get-BytesSha256 -Bytes $bytes) -ne ([string]$file.sha256).ToLowerInvariant()) { [void]$errors.Add("哈希不匹配：$packagePath") }
            } catch { [void]$errors.Add($_.Exception.Message) }
        }
    } catch { [void]$errors.Add("无法打开插件包：$($_.Exception.Message)") }
    finally { if ($null -ne $archive) { $archive.Dispose() } }
    return [pscustomobject]@{ valid = ($errors.Count -eq 0); pluginPath = $Path; plugin = [pscustomobject]@{ id = $manifest.id; name = $manifest.name; version = $manifest.version }; fileCount = @($manifest.files).Count; errors = @($errors) }
}

function Get-PluginInstallPlan {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Root)
    $manifest = Read-PluginManifest -Path $Path
    $validation = Validate-Plugin -Path $Path
    if (-not $validation.valid) { throw "插件校验失败：$($validation.errors -join '; ')" }
    $pluginRoot = Join-Path $env:USERPROFILE ".trae-cn\traeforge\plugins\$($manifest.id)\$($manifest.version)"
    $archive = [IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $plans = foreach ($file in @($manifest.files)) {
            $packagePath = [string]$file.packagePath
            if ($packagePath -eq 'plugin.json' -or $packagePath -eq 'README.md') { $target = Join-Path $pluginRoot $packagePath; $action = 'STORE' }
            elseif ($packagePath -like 'skills/*') { $target = Join-Path $env:USERPROFILE ".trae-cn\skills\$($packagePath.Substring(7))"; $action = 'INSTALL-SKILL' }
            elseif ($packagePath -like 'rules/*') { $target = Join-Path $Root ".trae\rules\$($packagePath.Substring(6))"; $action = 'INSTALL-RULE' }
            elseif ($packagePath -like 'mcp/*') { $target = Join-Path $Root '.trae\mcp.json'; $action = 'MERGE-MCP' }
            else { $target = Join-Path $pluginRoot "payload\$packagePath"; $action = 'STORE-PAYLOAD' }
            $exists = Test-Path -LiteralPath $target -PathType Leaf
            $same = $false
            if ($exists -and $action -ne 'MERGE-MCP') { $same = ((Get-Sha256 -Path $target) -eq ([string]$file.sha256).ToLowerInvariant()) }
            [pscustomobject]@{ packagePath = $packagePath; targetPath = $target; action = $action; exists = $exists; same = $same; status = if ($action -eq 'MERGE-MCP') { 'MERGE' } elseif (-not $exists) { 'ADDED' } elseif ($same) { 'UNCHANGED' } else { 'CHANGED' }; sha256 = $file.sha256 }
        }
        return [pscustomobject]@{ manifest = $manifest; archivePath = $Path; pluginRoot = $pluginRoot; plans = @($plans) }
    } finally { $archive.Dispose() }
}

function Backup-File {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$ProjectRoot)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
    $backupDir = Join-Path $ProjectRoot '.trae\traeforge\backups'
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    $backup = Join-Path $backupDir ("{0}-{1}" -f [DateTime]::Now.ToString('yyyyMMdd-HHmmss'), [IO.Path]::GetFileName($Path))
    Copy-Item -LiteralPath $Path -Destination $backup -Force
    Write-Output "BACKUP $backup"
}

function Merge-McpFile {
    param([Parameter(Mandatory)][string]$SourceText, [Parameter(Mandatory)][string]$TargetPath, [Parameter(Mandatory)][string]$PluginRoot, [Parameter(Mandatory)][string]$ProjectRoot, [Parameter(Mandatory)][string]$PluginId)
    $existing = if (Test-Path -LiteralPath $TargetPath -PathType Leaf) { Get-Content -Raw -LiteralPath $TargetPath | ConvertFrom-Json } else { [pscustomobject]@{ mcpServers = [pscustomobject]@{} } }
    $incoming = ($SourceText.Replace('${pluginRoot}', $PluginRoot)) | ConvertFrom-Json
    if ($null -eq $existing.mcpServers) { $existing | Add-Member -NotePropertyName mcpServers -NotePropertyValue ([pscustomobject]@{}) -Force }
    $incomingServers = if ($null -ne $incoming.mcpServers) { $incoming.mcpServers } else { $incoming }
    foreach ($property in $incomingServers.PSObject.Properties) {
        $name = $property.Name
        $targetName = $name
        if ($null -ne $existing.mcpServers.PSObject.Properties[$targetName]) {
            if ($Conflict -eq 'fail') { throw "MCP Server 冲突：$name" }
            if ($Conflict -eq 'skip') { continue }
            if ($Conflict -eq 'side-by-side') { $targetName = "$($name)-$PluginId" }
        }
        $existing.mcpServers | Add-Member -NotePropertyName $targetName -NotePropertyValue $property.Value -Force
    }
    Backup-File -Path $TargetPath -ProjectRoot $ProjectRoot
    $parent = Split-Path -Parent $TargetPath
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    [IO.File]::WriteAllText($TargetPath, ($existing | ConvertTo-Json -Depth 30), [Text.UTF8Encoding]::new($false))
    Write-Output "MERGE $TargetPath"
}

function Update-Registry {
    param([Parameter(Mandatory)][object]$Manifest, [Parameter(Mandatory)][string]$PluginRoot)
    $registryPath = Join-Path $env:USERPROFILE '.trae-cn\traeforge\registry.json'
    $registryDir = Split-Path -Parent $registryPath
    New-Item -ItemType Directory -Force -Path $registryDir | Out-Null
    $registry = if (Test-Path -LiteralPath $registryPath -PathType Leaf) { Get-Content -Raw -LiteralPath $registryPath | ConvertFrom-Json } else { [pscustomobject]@{ schemaVersion = 1; plugins = @() } }
    $plugins = [System.Collections.Generic.List[object]]::new()
    foreach ($entry in @($registry.plugins)) { [void]$plugins.Add($entry) }
    $existing = @($plugins | Where-Object id -eq $Manifest.id | Select-Object -First 1)
    $versionEntry = [pscustomobject]@{ version = $Manifest.version; installedAt = [DateTime]::UtcNow.ToString('o'); root = $PluginRoot }
    if ($existing.Count -eq 0) {
        [void]$plugins.Add([pscustomobject]@{ id = $Manifest.id; name = $Manifest.name; activeVersion = $Manifest.version; versions = @($versionEntry) })
    } else {
        $entry = $existing[0]
        $versions = [System.Collections.Generic.List[object]]::new()
        foreach ($version in @($entry.versions)) { if ($version.version -ne $Manifest.version) { [void]$versions.Add($version) } }
        [void]$versions.Add($versionEntry)
        $entry.activeVersion = $Manifest.version
        $entry.versions = @($versions)
    }
    [IO.File]::WriteAllText($registryPath, ([pscustomobject]@{ schemaVersion = 1; updatedAt = [DateTime]::UtcNow.ToString('o'); plugins = @($plugins) } | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
}

function Apply-PluginPlan {
    param([Parameter(Mandatory)][object]$Plan, [Parameter(Mandatory)][string]$ProjectRoot)
    if (-not $Apply) { Write-Output '当前是预览模式，未写入任何文件。若确认应用，请显式传入 -Apply。'; return }
    $changed = @($Plan.plans | Where-Object status -eq 'CHANGED')
    if ($Conflict -eq 'fail' -and $changed.Count -gt 0) { throw "存在 $($changed.Count) 个冲突文件。请使用 -Conflict skip、overwrite 或 side-by-side。" }
    $archive = [IO.Compression.ZipFile]::OpenRead($Plan.archivePath)
    try {
        New-Item -ItemType Directory -Force -Path $Plan.pluginRoot | Out-Null
        [IO.File]::WriteAllText((Join-Path $Plan.pluginRoot 'plugin.json'), ($Plan.manifest | ConvertTo-Json -Depth 30), [Text.UTF8Encoding]::new($false))
        foreach ($item in $Plan.plans) {
            if ($item.status -eq 'UNCHANGED') { continue }
            if ($item.status -eq 'CHANGED' -and $Conflict -eq 'skip') { continue }
            $bytes = Get-PackEntryBytes -Archive $archive -EntryName $item.packagePath
            if ($item.action -eq 'MERGE-MCP') {
                Merge-McpFile -SourceText ([Text.UTF8Encoding]::new($false).GetString($bytes)) -TargetPath $item.targetPath -PluginRoot $Plan.pluginRoot -ProjectRoot $ProjectRoot -PluginId $Plan.manifest.id
                continue
            }
            $target = $item.targetPath
            if ($item.status -eq 'CHANGED' -and $Conflict -eq 'side-by-side') { $target = "$target.traeforge-copy" }
            if ($item.status -eq 'CHANGED' -and $Conflict -eq 'overwrite') { Backup-File -Path $target -ProjectRoot $ProjectRoot }
            $parent = Split-Path -Parent $target
            New-Item -ItemType Directory -Force -Path $parent | Out-Null
            [IO.File]::WriteAllBytes($target, $bytes)
            Write-Output "WRITE $target"
        }
        Update-Registry -Manifest $Plan.manifest -PluginRoot $Plan.pluginRoot
        Write-Output "REGISTER $($Plan.manifest.id)@$($Plan.manifest.version)"
    } finally { $archive.Dispose() }
}

$root = Resolve-FullPath -Path $ProjectPath
switch ($Command) {
    'pack' {
        if ([string]::IsNullOrWhiteSpace($SourcePath)) { throw '-SourcePath 是必填项。' }
        $source = Resolve-FullPath -Path $SourcePath
        $metadata = Get-PluginMetadata -Root $source
        if ([string]::IsNullOrWhiteSpace($OutputPath)) { $OutputPath = Join-Path (Get-Location).Path "$($metadata.id)-$($metadata.version).trae-plugin" }
        Pack-Plugin -Root $source -Destination ([IO.Path]::GetFullPath($OutputPath))
    }
    'inspect' {
        if ([string]::IsNullOrWhiteSpace($PluginPath)) { throw '-PluginPath 是必填项。' }
        Read-PluginManifest -Path (Resolve-FullPath -Path $PluginPath) | ConvertTo-Json -Depth 30
    }
    'validate' {
        if ([string]::IsNullOrWhiteSpace($PluginPath)) { throw '-PluginPath 是必填项。' }
        $result = Validate-Plugin -Path (Resolve-FullPath -Path $PluginPath)
        if ($Json) { $result | ConvertTo-Json -Depth 20 } else { $result | Format-List }
    }
    'install' {
        if ([string]::IsNullOrWhiteSpace($PluginPath)) { throw '-PluginPath 是必填项。' }
        $plan = Get-PluginInstallPlan -Path (Resolve-FullPath -Path $PluginPath) -Root $root
        if ($Json -and -not $Apply) { [pscustomobject]@{ plugin = $plan.manifest; pluginRoot = $plan.pluginRoot; plans = @($plan.plans) } | ConvertTo-Json -Depth 30 } else { $plan.plans | Select-Object status,action,packagePath,targetPath | Format-Table -Wrap -AutoSize; Apply-PluginPlan -Plan $plan -ProjectRoot $root }
    }
    'list' {
        $registryPath = Join-Path $env:USERPROFILE '.trae-cn\traeforge\registry.json'
        $result = if (Test-Path -LiteralPath $registryPath -PathType Leaf) { Get-Content -Raw -LiteralPath $registryPath | ConvertFrom-Json } else { [pscustomobject]@{ schemaVersion = 1; plugins = @() } }
        if ($Json) { $result | ConvertTo-Json -Depth 20 } else { @($result.plugins) | Format-Table id,name,activeVersion -AutoSize }
    }
}
