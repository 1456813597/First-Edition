param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

& (Join-Path $PSScriptRoot "pnpm-node.ps1") @Args
exit $LASTEXITCODE
