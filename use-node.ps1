$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeDir = Join-Path $root ".tools\node-v24.14.0-win-x64"

if (-not (Test-Path (Join-Path $nodeDir "node.exe"))) {
  Write-Error "Node portatil nao encontrado em $nodeDir"
  exit 1
}

$env:Path = "$nodeDir;$env:Path"
Write-Host "Node habilitado nesta sessao do PowerShell."
Write-Host "Agora voce pode usar: node index.js"
