param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$nodeBin = Join-Path $repoRoot "tools\node22"
$pnpmBin = Join-Path $env:APPDATA "npm"
$env:Path = "$nodeBin;$pnpmBin;$env:Path"

# VS Code / extension host may inject this and force Electron to run as plain Node.
if (Test-Path Env:ELECTRON_RUN_AS_NODE) {
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}

& (Join-Path $pnpmBin "pnpm.cmd") @Args
