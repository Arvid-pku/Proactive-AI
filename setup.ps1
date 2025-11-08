# Proactive AI Assistant - Setup Script for Windows
# Run with: .\setup.ps1

Write-Host "`n🎯 Proactive AI Assistant - Setup`n" -ForegroundColor Cyan

# Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js $nodeVersion found" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found! Please install from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "`nInstalling dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Generate icons
Write-Host "`nGenerating icon files..." -ForegroundColor Yellow
node scripts/create-simple-icons.js
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Icon files created" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to create icons" -ForegroundColor Red
    exit 1
}

# Build extension
Write-Host "`nBuilding extension..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Extension built successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Build failed" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ Setup Complete!`n" -ForegroundColor Green

Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Open Chrome and go to: chrome://extensions/" -ForegroundColor White
Write-Host "2. Enable 'Developer mode' (top right)" -ForegroundColor White
Write-Host "3. Click 'Load unpacked'" -ForegroundColor White
Write-Host "4. Select the 'dist' folder" -ForegroundColor White
Write-Host "5. Click the extension icon and configure your API key`n" -ForegroundColor White

Write-Host "📚 Documentation:" -ForegroundColor Cyan
Write-Host "   - QUICKSTART.md - Quick start guide" -ForegroundColor White
Write-Host "   - README.md - Full documentation" -ForegroundColor White
Write-Host "   - FEATURES.md - All features`n" -ForegroundColor White

Write-Host "🎉 Happy browsing with AI assistance!`n" -ForegroundColor Magenta

