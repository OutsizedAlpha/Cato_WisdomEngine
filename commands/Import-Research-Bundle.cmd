@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Cato-Launcher.ps1" -Action capture-research -BundlePath "%~1"
