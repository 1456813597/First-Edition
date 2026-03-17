param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$preferredNodeBin = Join-Path $repoRoot "tools\node24"
$packageJsonPath = Join-Path $repoRoot "package.json"
$nodeExe = $null
$nodeBin = $null
$packageManager = "pnpm@10.16.1"

if (Test-Path $packageJsonPath) {
  $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
  if ($packageJson.packageManager -and $packageJson.packageManager.StartsWith("pnpm@")) {
    $packageManager = $packageJson.packageManager
  }
}

if (Test-Path (Join-Path $preferredNodeBin "node.exe")) {
  $nodeBin = $preferredNodeBin
  $nodeExe = Join-Path $preferredNodeBin "node.exe"
} else {
  $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($systemNode) {
    $nodeExe = $systemNode.Source
    $nodeBin = Split-Path -Parent $nodeExe
  }
}

if (-not $nodeExe) {
  throw "未找到 Node.js。请先安装 Node 24.x，或将官方 Windows 发行版解压到 tools/node24。"
}

$nodeVersion = & $nodeExe -p "process.versions.node"
if ($LASTEXITCODE -ne 0) {
  throw "无法检测 Node 版本，请确认 Node 安装可用。"
}

if (-not $nodeVersion.StartsWith("24.")) {
  throw "检测到 Node $nodeVersion。当前仓库已切换到 Node 24 LTS，请先切换到 24.x 后再执行。"
}

$pnpmBin = Join-Path $env:APPDATA "npm"
$env:Path = "$nodeBin;$pnpmBin;$env:Path"

# VS Code / extension host may inject this and force Electron to run as plain Node.
if (Test-Path Env:ELECTRON_RUN_AS_NODE) {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}

$corepackCmd = Join-Path $nodeBin "corepack.cmd"
$pnpmCmd = Join-Path $pnpmBin "pnpm.cmd"
$npxCmd = Join-Path $nodeBin "npx.cmd"

if (Test-Path $corepackCmd) {
  & $corepackCmd pnpm @Args
  exit $LASTEXITCODE
}

if (Test-Path $pnpmCmd) {
  & $pnpmCmd @Args
  exit $LASTEXITCODE
}

if (Test-Path $npxCmd) {
  & $npxCmd $packageManager @Args
  exit $LASTEXITCODE
}

throw "未找到可用的 pnpm 入口。请安装官方 Node 24（包含 corepack / npx），或手动安装 pnpm 10.16.1。"
