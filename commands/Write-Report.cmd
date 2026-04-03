@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Cato-Launcher.ps1" -Action report %*
