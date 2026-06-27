# Starts the Python backend and the Next.js frontend together (Windows / PowerShell).
# Usage:  ./dev.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "Starting GigaChad Cloud..." -ForegroundColor Magenta

# Backend (FastAPI on :8000)
$backend = Join-Path $root "backend"
$venvPy = Join-Path $backend ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    Write-Host "Creating Python virtual environment + installing deps..." -ForegroundColor Yellow
    python -m venv (Join-Path $backend ".venv")
    & $venvPy -m pip install --upgrade pip
    & $venvPy -m pip install -r (Join-Path $backend "requirements.txt")
}
Start-Process -FilePath $venvPy `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000" `
    -WorkingDirectory $backend
Write-Host "Backend  -> http://127.0.0.1:8000  (docs at /docs)" -ForegroundColor Green

# Frontend (Next.js on :3000)
Write-Host "Frontend -> http://localhost:3000" -ForegroundColor Green
npm run dev
