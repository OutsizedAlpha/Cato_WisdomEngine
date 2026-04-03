@echo off
setlocal
set "CATO_ROOT=%~dp0"
powershell -NoExit -ExecutionPolicy Bypass -Command "$env:PATH='%CATO_ROOT%;' + $env:PATH; Set-Location '%CATO_ROOT%'; Write-Output 'Cato Python wrappers enabled for this session.'; Write-Output 'Try: python --version'"
