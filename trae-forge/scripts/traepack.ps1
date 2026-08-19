[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('scan', 'preflight', 'doctor', 'export', 'inspect', 'validate', 'report', 'install', 'diff')]
    [string]$Command = 'scan',

    [string]$ProjectPath = (Get-Location).Path,
    [string]$PackPath,
    [string]$OutputPath,
    [string]$PackName,
    [switch]$IncludeGlobalSkills,
    [switch]$IncludeTraeGlobal,
    [switch]$IncludeProjectScripts,
    [switch]$IncludeProjectTemplates,
    [switch]$Json,
    [switch]$Apply,
    [switch]$Force,
    [ValidateSet('fail', 'skip', 'overwrite', 'side-by-side')]
    [string]$Conflict = 'fail'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:TraeForgeVersion = '0.4.0'

function Resolve-FullPath {
    param([Parameter(Mandatory)][string]$Path)
    $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
    return $resolved.Path
}

function Get-Sha256 {
    param([Parameter(Mandatory)][string]$Path)
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Get-RelativePath {
    param(
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][string]$Path
    )
    $rootWithSlash = $Root.TrimEnd('\') + '\'
    if (-not $Path.StartsWith($rootWithSlash, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "路径不在根目录内：$Path"
    }
    return $Path.Substring($rootWithSlash.Length).Replace('\', '/')
}

function Add-FileRecord {
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][System.Collections.Generic.List[object]]$Records,
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$PackagePath,
        [Parameter(Mandatory)][string]$Scope
    )
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return
    }
    $item = Get-Item -LiteralPath $Path
    [void]$Records.Add([pscustomobject]@{
        sourcePath = $item.FullName
        packagePath = $PackagePath.Replace('\', '/')
        scope = $Scope
        size = [int64]$item.Length
        sha256 = Get-Sha256 -Path $item.FullName
    })
}

function Add-FolderRecords {
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][System.Collections.Generic.List[object]]$Records,
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][string]$PackagePrefix,
        [Parameter(Mandatory)][string]$Scope
    )
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
        return
    }
    Get-ChildItem -LiteralPath $Root -Recurse -File -Force | ForEach-Object {
        $relative = Get-RelativePath -Root $Root -Path $_.FullName
        Add-FileRecord -Records $Records -Path $_.FullName -PackagePath "$PackagePrefix/$relative" -Scope $Scope
    }
}

function Add-InstalledPluginManifestRecords {
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][System.Collections.Generic.List[object]]$Records
    )
    $pluginRoot = Join-Path $env:USERPROFILE '.trae-cn\plugins'
    if (-not (Test-Path -LiteralPath $pluginRoot -PathType Container)) {
        return
    }
    Get-ChildItem -LiteralPath $pluginRoot -Recurse -File -Force -Filter 'plugin.json' |
        Where-Object { $_.FullName -match '\\.trae-plugin\\plugin\.json$' } |
        ForEach-Object {
            $relative = Get-RelativePath -Root $pluginRoot -Path $_.FullName
            Add-FileRecord -Records $Records -Path $_.FullName -PackagePath "global/plugin-manifests/$relative" -Scope 'global'
        }
}

function Get-Inventory {
    param(
        [Parameter(Mandatory)][string]$Root,
        [switch]$WithGlobal,
        [switch]$WithTraeGlobal,
        [switch]$WithScripts,
        [switch]$WithTemplates
    )
    $records = [System.Collections.Generic.List[object]]::new()

    Add-FolderRecords -Records $records -Root (Join-Path $Root '.trae\skills') -PackagePrefix 'project/.trae/skills' -Scope 'project'
    Add-FolderRecords -Records $records -Root (Join-Path $Root '.trae\rules') -PackagePrefix 'project/.trae/rules' -Scope 'project'
    Add-FileRecord -Records $records -Path (Join-Path $Root '.trae\mcp.json') -PackagePath 'project/.trae/mcp.json' -Scope 'project'
    Add-FileRecord -Records $records -Path (Join-Path $Root 'AGENTS.md') -PackagePath 'project/AGENTS.md' -Scope 'project'

    if ($WithScripts) {
        Add-FolderRecords -Records $records -Root (Join-Path $Root 'scripts') -PackagePrefix 'project/scripts' -Scope 'project'
    }
    if ($WithTemplates) {
        Add-FolderRecords -Records $records -Root (Join-Path $Root 'templates') -PackagePrefix 'project/templates' -Scope 'project'
    }
    if ($WithGlobal -or $WithTraeGlobal) {
        $globalSkills = Join-Path $env:USERPROFILE '.trae-cn\skills'
        Add-FolderRecords -Records $records -Root $globalSkills -PackagePrefix 'global/skills' -Scope 'global'
    }
    if ($WithTraeGlobal) {
        $globalMcps = Join-Path $env:USERPROFILE '.trae-cn\mcps'
        Add-FolderRecords -Records $records -Root $globalMcps -PackagePrefix 'global/mcps' -Scope 'global'
        Add-InstalledPluginManifestRecords -Records $records
    }

    return @($records | Sort-Object packagePath -Unique)
}

function Find-Secrets {
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Records)
    $findings = [System.Collections.Generic.List[object]]::new()
    $patterns = @(
        @{ Name = 'private-key'; Regex = '-----BEGIN (RSA|OPENSSH|EC|DSA|PRIVATE) KEY-----' },
        @{ Name = 'api-key-assignment'; Regex = '(?i)(api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|secret)\s*["'']?\s*[:=]\s*["'']?[^\s"'']{12,}' },
        @{ Name = 'bearer-token'; Regex = '(?i)\bBearer\s+[A-Za-z0-9._\-/+=]{20,}' },
        @{ Name = 'openai-like-key'; Regex = '\bsk-[A-Za-z0-9_-]{16,}\b' }
    )
    foreach ($record in $Records) {
        $name = [IO.Path]::GetFileName($record.sourcePath)
        if ($name -match '^(\.env|\.env\..+|id_rsa|credentials|secrets?)$') {
            [void]$findings.Add([pscustomobject]@{ path = $record.packagePath; line = 0; kind = 'sensitive-filename'; sample = '[redacted]' })
            continue
        }
        if ($record.size -gt 2MB) {
            continue
        }
        try {
            $content = Get-Content -Raw -LiteralPath $record.sourcePath -ErrorAction Stop
        } catch {
            continue
        }
        $lineNumber = 0
        foreach ($line in ($content -split "`r?`n")) {
            $lineNumber++
            foreach ($pattern in $patterns) {
                if ($line -match $pattern.Regex) {
                    [void]$findings.Add([pscustomobject]@{ path = $record.packagePath; line = $lineNumber; kind = $pattern.Name; sample = '[redacted]' })
                }
            }
        }
    }
    return @($findings)
}

function Get-ProjectMcpOverview {
    param([Parameter(Mandatory)][string]$Root)
    $path = Join-Path $Root '.trae\mcp.json'
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        return [pscustomobject]@{ exists = $false; valid = $true; path = 'project/.trae/mcp.json'; servers = @(); error = $null }
    }
    try {
        $config = Get-Content -Raw -LiteralPath $path | ConvertFrom-Json
        $serverObject = if ($null -ne $config.mcpServers) { $config.mcpServers } else { $config }
        $servers = @($serverObject.PSObject.Properties | ForEach-Object { [pscustomobject]@{ name = $_.Name; source = 'project'; status = 'configured' } })
        return [pscustomobject]@{ exists = $true; valid = $true; path = 'project/.trae/mcp.json'; servers = $servers; error = $null }
    } catch {
        return [pscustomobject]@{ exists = $true; valid = $false; path = 'project/.trae/mcp.json'; servers = @(); error = $_.Exception.Message }
    }
}

function Get-ProjectSkillOverview {
    param([Parameter(Mandatory)][string]$Root)
    $skillRoot = Join-Path $Root '.trae\skills'
    if (-not (Test-Path -LiteralPath $skillRoot -PathType Container)) { return @() }
    return @(Get-ChildItem -LiteralPath $skillRoot -Directory -Force | ForEach-Object {
        $skillFile = Join-Path $_.FullName 'SKILL.md'
        if (Test-Path -LiteralPath $skillFile -PathType Leaf) {
            [pscustomobject]@{ name = $_.Name; source = 'project'; path = "project/.trae/skills/$($_.Name)/SKILL.md"; status = 'configured' }
        }
    })
}

function Get-GlobalSkillOverview {
    $skillRoot = Join-Path $env:USERPROFILE '.trae-cn\skills'
    if (-not (Test-Path -LiteralPath $skillRoot -PathType Container)) { return @() }
    return @(Get-ChildItem -LiteralPath $skillRoot -Directory -Force | ForEach-Object {
        $skillFile = Join-Path $_.FullName 'SKILL.md'
        if (Test-Path -LiteralPath $skillFile -PathType Leaf) {
            [pscustomobject]@{ name = $_.Name; source = 'global'; path = "global/skills/$($_.Name)/SKILL.md"; status = 'installed' }
        }
    })
}

function Get-GlobalMcpOverview {
    $mcpRoot = Join-Path $env:USERPROFILE '.trae-cn\mcps'
    $rows = [System.Collections.Generic.List[object]]::new()
    if (-not (Test-Path -LiteralPath $mcpRoot -PathType Container)) { return @() }
    Get-ChildItem -LiteralPath $mcpRoot -Recurse -File -Force -Filter 'SERVER_METADATA.json' | ForEach-Object {
        $serverRoot = Split-Path -Parent $_.FullName
        $metadata = $null
        try { $metadata = Get-Content -Raw -LiteralPath $_.FullName | ConvertFrom-Json } catch { $metadata = $null }
        $toolRoot = Join-Path $serverRoot 'tools'
        $toolFiles = @()
        if (Test-Path -LiteralPath $toolRoot -PathType Container) { $toolFiles = @(Get-ChildItem -LiteralPath $toolRoot -File -Force) }
        $relative = Get-RelativePath -Root $mcpRoot -Path $_.FullName
        [void]$rows.Add([pscustomobject]@{
            name = if ($null -ne $metadata -and $metadata.server_name) { [string]$metadata.server_name } else { Split-Path -Leaf $serverRoot }
            source = 'global'
            metadataPath = "global/mcps/$relative"
            toolCount = $toolFiles.Count
            estimatedSchemaBytes = [int64](@($toolFiles | Measure-Object -Property Length -Sum).Sum)
            toolNames = @($toolFiles | ForEach-Object { $_.BaseName } | Sort-Object)
            status = 'discovered'
        })
    }
    return @($rows | Sort-Object name, metadataPath)
}

function New-PreflightReport {
    param([Parameter(Mandatory)][string]$Root)
    $projectMcp = Get-ProjectMcpOverview -Root $Root
    $projectSkills = @(Get-ProjectSkillOverview -Root $Root)
    $globalSkills = @(Get-GlobalSkillOverview)
    $globalMcp = @(Get-GlobalMcpOverview)
    $diagnostics = [System.Collections.Generic.List[object]]::new()
    $projectName = Split-Path -Leaf $Root
    if ([string]::IsNullOrWhiteSpace($projectName)) { $projectName = 'trae-project' }

    if (-not $projectMcp.valid) {
        [void]$diagnostics.Add([pscustomobject]@{ id = 'project-mcp-invalid'; severity = 'error'; title = '项目 MCP 配置无法解析'; detail = $projectMcp.error; action = '修复 .trae/mcp.json 的 JSON 语法后重新预检。' })
    } elseif (-not $projectMcp.exists -and $globalMcp.Count -gt 0) {
        [void]$diagnostics.Add([pscustomobject]@{ id = 'global-project-split'; severity = 'warning'; title = '全局 MCP 与当前项目没有共同配置入口'; detail = "发现 $($globalMcp.Count) 个全局 MCP metadata，但当前项目没有 .trae/mcp.json；部分 TRAE 模式可能只读取项目级 MCP。"; action = '在当前项目配置需要使用的 MCP，或在 Agent 中验证全局能力是否真正可见。' })
    }
    if ($globalSkills.Count -gt 0 -and $projectSkills.Count -eq 0) {
        [void]$diagnostics.Add([pscustomobject]@{ id = 'global-skill-inheritance-unknown'; severity = 'warning'; title = '全局 Skill 是否被当前模式继承仍未知'; detail = "发现 $($globalSkills.Count) 个全局 Skill，但当前项目没有项目级 Skill；静态文件存在不等于当前 Agent 已加载。"; action = '在当前对话中显式调用一个 Skill，或把关键 Skill 放到项目 .trae/skills/ 做对照测试。' })
    }
    $toolCount = [int64](@($globalMcp | Measure-Object -Property toolCount -Sum).Sum)
    $schemaBytes = [int64](@($globalMcp | Measure-Object -Property estimatedSchemaBytes -Sum).Sum)
    if ($toolCount -gt 40) {
        [void]$diagnostics.Add([pscustomobject]@{ id = 'tool-budget-risk'; severity = 'warning'; title = '工具数量存在上下文预算风险'; detail = "当前静态 metadata 中估算出 $toolCount 个工具；工具过多时可能出现已连接但 Agent 不可见。"; action = '先关闭无关 MCP，再重新运行预检。' })
    }
    if ($schemaBytes -gt 8000) {
        [void]$diagnostics.Add([pscustomobject]@{ id = 'schema-budget-risk'; severity = 'warning'; title = '工具描述存在上下文预算风险'; detail = "工具 Schema 文件总大小约 $schemaBytes 字节；描述过长可能挤占 Agent 工具上下文。"; action = '精简工具描述，或按任务拆分 MCP。' })
    }
    $duplicateNames = @($globalMcp | Group-Object name | Where-Object Count -gt 1)
    foreach ($duplicate in $duplicateNames) {
        [void]$diagnostics.Add([pscustomobject]@{ id = "duplicate-mcp-$($duplicate.Name)"; severity = 'warning'; title = "MCP 名称重复：$($duplicate.Name)"; detail = '多个全局 metadata 使用相同 server_name，模式切换时可能出现来源不清。'; action = '保留一个来源，或在项目配置中明确指定。' })
    }
    [void]$diagnostics.Add([pscustomobject]@{ id = 'runtime-boundary'; severity = 'info'; title = '运行时工具暴露仍需实际探针'; detail = '本次预检只读取公开配置、Skill 文件和 MCP metadata，不读取 TRAE 私有会话数据库，因此不能证明当前 Agent 最终可见的工具集合。'; action = '下一步通过一次真实 Agent/MCP 调用记录可见工具和调用结果。' })

    $capabilities = @(
        [pscustomobject]@{ id = 'project-mcp'; label = '项目 MCP'; scope = 'project'; configured = $projectMcp.exists; count = @($projectMcp.servers).Count; status = if (-not $projectMcp.exists) { 'missing' } elseif (-not $projectMcp.valid) { 'error' } else { 'configured' }; why = if (-not $projectMcp.exists) { '当前项目没有 .trae/mcp.json' } else { '项目配置已发现，但运行时继承仍需验证' } },
        [pscustomobject]@{ id = 'global-mcp'; label = '全局 MCP metadata'; scope = 'global'; configured = ($globalMcp.Count -gt 0); count = $globalMcp.Count; status = if ($globalMcp.Count -eq 0) { 'missing' } else { 'discovered' }; why = if ($globalMcp.Count -eq 0) { '没有发现 SERVER_METADATA.json' } else { '已发现，但不等于当前 Agent 已暴露工具' } },
        [pscustomobject]@{ id = 'project-skills'; label = '项目 Skills'; scope = 'project'; configured = ($projectSkills.Count -gt 0); count = $projectSkills.Count; status = if ($projectSkills.Count -eq 0) { 'missing' } else { 'configured' }; why = if ($projectSkills.Count -eq 0) { '当前项目没有 .trae/skills' } else { '项目 Skill 文件已发现' } },
        [pscustomobject]@{ id = 'global-skills'; label = '全局 Skills'; scope = 'global'; configured = ($globalSkills.Count -gt 0); count = $globalSkills.Count; status = if ($globalSkills.Count -eq 0) { 'missing' } else { 'discovered' }; why = if ($globalSkills.Count -eq 0) { '全局目录没有 SKILL.md' } else { '全局 Skill 已发现，但运行时继承仍未知' } }
    )
    return [pscustomobject]@{
        schemaVersion = 1
        tool = 'TraeForge'
        toolVersion = $script:TraeForgeVersion
        generatedAt = [DateTime]::UtcNow.ToString('o')
        project = [pscustomobject]@{ name = $projectName; mode = 'unknown'; modeReason = '没有读取 TRAE 私有会话状态' }
        summary = [pscustomobject]@{ diagnostics = $diagnostics.Count; errors = @($diagnostics | Where-Object severity -eq 'error').Count; warnings = @($diagnostics | Where-Object severity -eq 'warning').Count; projectMcpServers = @($projectMcp.servers).Count; globalMcpServers = $globalMcp.Count; estimatedGlobalTools = $toolCount; estimatedSchemaBytes = $schemaBytes }
        capabilities = $capabilities
        mcpServers = [pscustomobject]@{ project = @($projectMcp.servers); global = $globalMcp }
        skills = [pscustomobject]@{ project = $projectSkills; global = $globalSkills }
        diagnostics = @($diagnostics)
    }
}

function Get-SafeRecords {
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Records)
    return @($Records | ForEach-Object {
        [pscustomobject]@{
            packagePath = $_.packagePath
            scope = $_.scope
            size = $_.size
            sha256 = $_.sha256
        }
    })
}

function Get-SafeFindings {
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Findings)
    return @($Findings | ForEach-Object {
        [pscustomobject]@{
            path = $_.path
            line = $_.line
            kind = $_.kind
            redacted = $true
        }
    })
}

function New-ScanReport {
    param(
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Records,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Findings
    )
    $projectName = Split-Path -Leaf $Root
    if ([string]::IsNullOrWhiteSpace($projectName)) { $projectName = 'trae-project' }
    return [pscustomobject]@{
        schemaVersion = 1
        tool = 'TraeForge'
        toolVersion = $script:TraeForgeVersion
        generatedAt = [DateTime]::UtcNow.ToString('o')
        project = [pscustomobject]@{
            name = $projectName
            platform = 'windows'
        }
        summary = [pscustomobject]@{
            files = $Records.Count
            projectFiles = @($Records | Where-Object scope -eq 'project').Count
            globalFiles = @($Records | Where-Object scope -eq 'global').Count
            secretFindings = $Findings.Count
        }
        files = Get-SafeRecords -Records $Records
        secretFindings = Get-SafeFindings -Findings $Findings
    }
}

function New-Manifest {
    param(
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Records,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Findings
    )
    $name = $PackName
    if ([string]::IsNullOrWhiteSpace($name)) {
        $name = Split-Path -Leaf $Root
        if ([string]::IsNullOrWhiteSpace($name)) { $name = 'trae-project' }
    }
    return [pscustomobject]@{
        schemaVersion = 1
        name = $name
        version = $script:TraeForgeVersion
        generatedAt = [DateTime]::UtcNow.ToString('o')
        platform = 'windows'
        source = [pscustomobject]@{
            kind = 'local-filesystem'
            globalSkillsIncluded = @($Records | Where-Object { $_.packagePath -like 'global/skills/*' }).Count -gt 0
            globalTraeMetadataIncluded = @($Records | Where-Object { $_.packagePath -like 'global/mcps/*' -or $_.packagePath -like 'global/plugin-manifests/*' }).Count -gt 0
        }
        safety = [pscustomobject]@{
            secretScanPassed = ($Findings.Count -eq 0)
            findings = Get-SafeFindings -Findings $Findings
        }
        files = @($Records | ForEach-Object {
            [pscustomobject]@{
                packagePath = $_.packagePath
                scope = $_.scope
                size = $_.size
                sha256 = $_.sha256
            }
        })
    }
}

function Show-Scan {
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Records, [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Findings)
    $summary = [pscustomobject]@{
        files = $Records.Count
        projectFiles = @($Records | Where-Object scope -eq 'project').Count
        globalFiles = @($Records | Where-Object scope -eq 'global').Count
        secretFindings = $Findings.Count
    }
    $summary | Format-List
    if ($Records.Count -gt 0) {
        $Records | Select-Object scope, size, sha256, packagePath | Format-Table -AutoSize
    } else {
        Write-Output '未找到可打包的 TRAE 项目文件。'
    }
    if ($Findings.Count -gt 0) {
        Write-Output 'SECRET FINDINGS:'
        $Findings | Format-Table -AutoSize
    }
}

function Add-ZipFile {
    param(
        [Parameter(Mandatory)][System.IO.Compression.ZipArchive]$Archive,
        [Parameter(Mandatory)][string]$EntryName,
        [Parameter(Mandatory)][string]$SourcePath
    )
    $entry = $Archive.CreateEntry($EntryName, [System.IO.Compression.CompressionLevel]::Optimal)
    $input = [System.IO.File]::OpenRead($SourcePath)
    $output = $entry.Open()
    try { $input.CopyTo($output) } finally { $output.Dispose(); $input.Dispose() }
}

function Add-ZipText {
    param(
        [Parameter(Mandatory)][System.IO.Compression.ZipArchive]$Archive,
        [Parameter(Mandatory)][string]$EntryName,
        [Parameter(Mandatory)][string]$Content
    )
    $entry = $Archive.CreateEntry($EntryName, [System.IO.Compression.CompressionLevel]::Optimal)
    $output = $entry.Open()
    $writer = [IO.StreamWriter]::new($output, [Text.UTF8Encoding]::new($false))
    try { $writer.Write($Content) } finally { $writer.Dispose(); $output.Dispose() }
}

function Get-BytesSha256 {
    param([Parameter(Mandatory)][byte[]]$Bytes)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function Test-SafePackagePath {
    param([Parameter(Mandatory)][string]$PackagePath)
    if ([string]::IsNullOrWhiteSpace($PackagePath)) { return $false }
    $normalized = $PackagePath.Replace('\\', '/')
    if ($normalized.StartsWith('/') -or $normalized -match '^[A-Za-z]:') { return $false }
    if ($normalized -match '(^|/)\.\.(/|$)' -or $normalized -match '(^|/)\.$') { return $false }
    return @('project/', 'global/skills/', 'global/mcps/', 'global/plugin-manifests/') |
        Where-Object { $normalized.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) } |
        Select-Object -First 1 | ForEach-Object { $true }
}

function Validate-Pack {
    param([Parameter(Mandatory)][string]$Path)
    $errors = [System.Collections.Generic.List[string]]::new()
    $manifest = $null
    try {
        $manifest = Read-PackManifest -Path $Path
    } catch {
        [void]$errors.Add($_.Exception.Message)
    }
    if ($null -eq $manifest) {
        return [pscustomobject]@{
            valid = $false
            packPath = $Path
            manifest = $null
            fileCount = 0
            errors = @($errors)
        }
    }
    if ($manifest.schemaVersion -ne 1) {
        [void]$errors.Add("不支持的 manifest schemaVersion：$($manifest.schemaVersion)")
    }
    $archive = $null
    try {
        $archive = [IO.Compression.ZipFile]::OpenRead($Path)
        $files = @($manifest.files)
        foreach ($file in $files) {
            $packagePath = [string]$file.packagePath
            if (-not (Test-SafePackagePath -PackagePath $packagePath)) {
                [void]$errors.Add("不安全的包内路径：$packagePath")
                continue
            }
            try {
                $bytes = Get-PackEntryBytes -Archive $archive -EntryName $packagePath
                $actualHash = Get-BytesSha256 -Bytes $bytes
                if ($actualHash -ne ([string]$file.sha256).ToLowerInvariant()) {
                    [void]$errors.Add("哈希不匹配：$packagePath")
                }
            } catch {
                [void]$errors.Add($_.Exception.Message)
            }
        }
    } catch {
        [void]$errors.Add("无法打开能力包：$($_.Exception.Message)")
    } finally {
        if ($null -ne $archive) { $archive.Dispose() }
    }
    return [pscustomobject]@{
        valid = ($errors.Count -eq 0)
        packPath = $Path
        manifest = [pscustomobject]@{
            name = $manifest.name
            version = $manifest.version
            schemaVersion = $manifest.schemaVersion
        }
        fileCount = @($manifest.files).Count
        errors = @($errors)
    }
}

function Write-JsonReport {
    param(
        [Parameter(Mandatory)][object]$Report,
        [Parameter(Mandatory)][string]$Destination
    )
    if ((Test-Path -LiteralPath $Destination) -and -not $Force) {
        throw "输出文件已存在：$Destination。若确认覆盖，请显式传入 -Force。"
    }
    $parent = Split-Path -Parent $Destination
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    [IO.File]::WriteAllText($Destination, ($Report | ConvertTo-Json -Depth 16), [Text.UTF8Encoding]::new($false))
    Write-Output "已写入报告：$Destination"
}

function Export-Pack {
    param(
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Records,
        [Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Findings,
        [Parameter(Mandatory)][string]$Destination
    )
    if ($Findings.Count -gt 0) {
        throw "发现 $($Findings.Count) 个疑似敏感信息，已阻止导出。请先移除或脱敏后重试。"
    }
    if ((Test-Path -LiteralPath $Destination) -and -not $Force) {
        throw "输出文件已存在：$Destination。若确认覆盖，请显式传入 -Force。"
    }
    $manifest = New-Manifest -Root $Root -Records $Records -Findings $Findings
    $manifestJson = $manifest | ConvertTo-Json -Depth 12
    $readme = @"
# TraePack: $($manifest.name)

- Version: $($manifest.version)
- Generated: $($manifest.generatedAt)
- Files: $($Records.Count)

This package was generated by TraeForge. Review the manifest before installation.
"@
    $stream = [System.IO.File]::Open($Destination, [IO.FileMode]::Create, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $archive = [System.IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        Add-ZipText -Archive $archive -EntryName 'manifest.json' -Content $manifestJson
        Add-ZipText -Archive $archive -EntryName 'README.md' -Content $readme
        foreach ($record in $Records) {
            Add-ZipFile -Archive $archive -EntryName $record.packagePath -SourcePath $record.sourcePath
        }
    } finally {
        $archive.Dispose()
        $stream.Dispose()
    }
    Write-Output "已导出：$Destination"
}

function Read-PackManifest {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "找不到能力包：$Path" }
    $archive = [IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $entry = $archive.GetEntry('manifest.json')
        if ($null -eq $entry) { throw '能力包缺少 manifest.json' }
        $reader = [IO.StreamReader]::new($entry.Open())
        try { return ($reader.ReadToEnd() | ConvertFrom-Json) } finally { $reader.Dispose() }
    } finally { $archive.Dispose() }
}

function Get-PackEntryBytes {
    param([Parameter(Mandatory)][System.IO.Compression.ZipArchive]$Archive, [Parameter(Mandatory)][string]$EntryName)
    $entry = $Archive.GetEntry($EntryName)
    if ($null -eq $entry) { throw "能力包缺少文件：$EntryName" }
    $input = $entry.Open()
    $memory = [IO.MemoryStream]::new()
    try { $input.CopyTo($memory); return $memory.ToArray() } finally { $memory.Dispose(); $input.Dispose() }
}

function Get-InstallTarget {
    param([Parameter(Mandatory)][string]$PackagePath, [Parameter(Mandatory)][string]$Root)
    $normalized = $PackagePath.Replace('/', '\')
    if ($normalized.StartsWith('project\', [StringComparison]::OrdinalIgnoreCase)) {
        $relative = $normalized.Substring('project\'.Length)
        return Join-Path $Root $relative
    }
    if ($normalized.StartsWith('global\skills\', [StringComparison]::OrdinalIgnoreCase)) {
        $relative = $normalized.Substring('global\skills\'.Length)
        return Join-Path $env:USERPROFILE ".trae-cn\skills\$relative"
    }
    if ($normalized.StartsWith('global\mcps\', [StringComparison]::OrdinalIgnoreCase)) {
        $relative = $normalized.Substring('global\mcps\'.Length)
        return Join-Path $env:USERPROFILE ".trae-cn\mcps\$relative"
    }
    if ($normalized.StartsWith('global\plugin-manifests\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "已安装插件 manifest 仅用于盘点和校验，不允许通过能力包直接安装：$PackagePath"
    }
    throw "不允许安装包内路径：$PackagePath"
}

function Get-InstallPlan {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Root)
    $manifest = Read-PackManifest -Path $Path
    $archive = [IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $plans = foreach ($file in $manifest.files) {
            $target = Get-InstallTarget -PackagePath $file.packagePath -Root $Root
            $exists = Test-Path -LiteralPath $target -PathType Leaf
            $same = $false
            if ($exists) { $same = ((Get-Sha256 -Path $target) -eq $file.sha256) }
            [pscustomobject]@{
                packagePath = $file.packagePath
                targetPath = $target
                exists = $exists
                same = $same
                status = if (-not $exists) { 'ADDED' } elseif ($same) { 'UNCHANGED' } else { 'CHANGED' }
                sha256 = $file.sha256
            }
        }
        return [pscustomobject]@{ manifest = $manifest; archivePath = $Path; plans = @($plans) }
    } finally { $archive.Dispose() }
}

function Show-InstallPlan {
    param([Parameter(Mandatory)][object]$Plan)
    $Plan.plans | Select-Object status, packagePath, targetPath | Format-Table -Wrap -AutoSize
    $Plan.plans | Group-Object status | Select-Object Name, Count | Format-Table -AutoSize
}

function Apply-InstallPlan {
    param([Parameter(Mandatory)][object]$Plan, [Parameter(Mandatory)][string]$Root)
    $conflicts = @($Plan.plans | Where-Object { $_.status -eq 'CHANGED' })
    if (-not $Apply) {
        Write-Output '当前是预览模式，未写入任何文件。若确认应用，请显式传入 -Apply。'
        return
    }
    if ($Conflict -eq 'fail' -and $conflicts.Count -gt 0) {
        throw "存在 $($conflicts.Count) 个冲突文件。请使用 -Conflict skip、-Conflict overwrite 或 -Conflict side-by-side。"
    }
    $archive = [IO.Compression.ZipFile]::OpenRead($Plan.archivePath)
    try {
        foreach ($item in $Plan.plans) {
            if ($item.status -eq 'UNCHANGED') { continue }
            if ($item.status -eq 'CHANGED' -and $Conflict -eq 'skip') { continue }
            $target = $item.targetPath
            if ($item.status -eq 'CHANGED' -and $Conflict -eq 'side-by-side') {
                $target = "$target.traeforge-copy"
            }
            if ($item.status -eq 'CHANGED' -and $Conflict -eq 'overwrite') {
                $backupDir = Join-Path $Root '.trae\traeforge\backups'
                New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
                $backup = Join-Path $backupDir ("{0}-{1}" -f [DateTime]::Now.ToString('yyyyMMdd-HHmmss'), [IO.Path]::GetFileName($target))
                Copy-Item -LiteralPath $target -Destination $backup -Force
                Write-Output "BACKUP $backup"
            }
            $parent = Split-Path -Parent $target
            New-Item -ItemType Directory -Force -Path $parent | Out-Null
            $bytes = Get-PackEntryBytes -Archive $archive -EntryName $item.packagePath
            [IO.File]::WriteAllBytes($target, $bytes)
            Write-Output "WRITE $target"
        }
    } finally { $archive.Dispose() }
}

$root = Resolve-FullPath -Path $ProjectPath
switch ($Command) {
    'scan' {
        $records = @(Get-Inventory -Root $root -WithGlobal:($IncludeGlobalSkills -or $IncludeTraeGlobal) -WithTraeGlobal:$IncludeTraeGlobal -WithScripts:$IncludeProjectScripts -WithTemplates:$IncludeProjectTemplates)
        $findings = @(Find-Secrets -Records $records)
        if ($Json) {
            New-ScanReport -Root $root -Records $records -Findings $findings | ConvertTo-Json -Depth 16
        } else {
            Show-Scan -Records $records -Findings $findings
        }
    }
    'preflight' { 
        $result = New-PreflightReport -Root $root
        if ($Json) { $result | ConvertTo-Json -Depth 30 } else {
            $result.summary | Format-List
            $result.capabilities | Format-Table id,scope,count,status,why -Wrap -AutoSize
            $result.diagnostics | Select-Object severity,title,detail,action | Format-Table -Wrap -AutoSize
        }
    }
    'doctor' {
        $result = New-PreflightReport -Root $root
        if ($Json) { $result | ConvertTo-Json -Depth 30 } else {
            $result.diagnostics | Select-Object severity,title,detail,action | Format-Table -Wrap -AutoSize
        }
    }
    'export' {
        $records = @(Get-Inventory -Root $root -WithGlobal:($IncludeGlobalSkills -or $IncludeTraeGlobal) -WithTraeGlobal:$IncludeTraeGlobal -WithScripts:$IncludeProjectScripts -WithTemplates:$IncludeProjectTemplates)
        $findings = @(Find-Secrets -Records $records)
        if ([string]::IsNullOrWhiteSpace($OutputPath)) {
            $OutputPath = Join-Path (Get-Location).Path ((Split-Path -Leaf $root) + '.traepack')
        }
        Export-Pack -Root $root -Records $records -Findings $findings -Destination ([IO.Path]::GetFullPath($OutputPath))
    }
    'inspect' {
        if ([string]::IsNullOrWhiteSpace($PackPath)) { throw '-PackPath 是必填项。' }
        $manifest = Read-PackManifest -Path (Resolve-FullPath -Path $PackPath)
        $manifest | ConvertTo-Json -Depth 12
    }
    'validate' {
        if ([string]::IsNullOrWhiteSpace($PackPath)) { throw '-PackPath 是必填项。' }
        $result = Validate-Pack -Path (Resolve-FullPath -Path $PackPath)
        if ($Json) {
            $result | ConvertTo-Json -Depth 16
        } else {
            $result | Format-List
        }
    }
    'report' {
        $records = @(Get-Inventory -Root $root -WithGlobal:($IncludeGlobalSkills -or $IncludeTraeGlobal) -WithTraeGlobal:$IncludeTraeGlobal -WithScripts:$IncludeProjectScripts -WithTemplates:$IncludeProjectTemplates)
        $findings = @(Find-Secrets -Records $records)
        if ([string]::IsNullOrWhiteSpace($OutputPath)) {
            $OutputPath = Join-Path (Get-Location).Path 'traeforge-report.json'
        }
        $report = New-ScanReport -Root $root -Records $records -Findings $findings
        Write-JsonReport -Report $report -Destination ([IO.Path]::GetFullPath($OutputPath))
    }
    'install' {
        if ([string]::IsNullOrWhiteSpace($PackPath)) { throw '-PackPath 是必填项。' }
        $plan = Get-InstallPlan -Path (Resolve-FullPath -Path $PackPath) -Root $root
        Show-InstallPlan -Plan $plan
        Apply-InstallPlan -Plan $plan -Root $root
    }
    'diff' {
        if ([string]::IsNullOrWhiteSpace($PackPath)) { throw '-PackPath 是必填项。' }
        $plan = Get-InstallPlan -Path (Resolve-FullPath -Path $PackPath) -Root $root
        Show-InstallPlan -Plan $plan
    }
}
