@echo off
setlocal
set "ROOT=%~dp0"
set "NODE=%ROOT%.tools\node-v24.14.0-win-x64\node.exe"

if not exist "%NODE%" (
  echo Node portatil nao encontrado em "%NODE%".
  exit /b 1
)

"%NODE%" "%ROOT%index.js"
