$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not ($env:PATH -split ';' | Where-Object { $_ -eq $repoRoot })) {
  $env:PATH = "$repoRoot;$env:PATH"
}

Set-Alias -Name python -Value (Join-Path $repoRoot 'python.cmd') -Scope Global
Set-Alias -Name py -Value (Join-Path $repoRoot 'py.cmd') -Scope Global

Write-Output "Cato Python wrappers enabled for this session."
Write-Output "Repo root added to PATH: $repoRoot"
Write-Output "Commands available: python, py"
Write-Output "Resolution order:"
Write-Output "  1. .venv\\Scripts\\python.exe"
Write-Output "  2. Windows registry PythonCore 3.13 ExecutablePath"
