@echo off
setlocal

if exist "%~dp0.venv\Scripts\python.exe" (
  "%~dp0.venv\Scripts\python.exe" %*
  exit /b %ERRORLEVEL%
)

set "CATO_PY_EXE="
for /f "tokens=2,*" %%A in ('reg query "HKCU\SOFTWARE\Python\PythonCore\3.13\InstallPath" /v ExecutablePath 2^>nul ^| findstr /I "ExecutablePath"') do set "CATO_PY_EXE=%%B"

if defined CATO_PY_EXE (
  "%CATO_PY_EXE%" %*
  exit /b %ERRORLEVEL%
)

echo Python could not be resolved for this repo.
echo Looked for:
echo   1. %~dp0.venv\Scripts\python.exe
echo   2. HKCU\SOFTWARE\Python\PythonCore\3.13\InstallPath\ExecutablePath
exit /b 1
