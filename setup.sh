#!/bin/bash
# Proactive AI Assistant - Setup Script for macOS/Linux
# Run with: chmod +x setup.sh && ./setup.sh

echo ""
echo "🎯 Proactive AI Assistant - Setup"
echo ""

# Check Node.js
echo "Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✓ Node.js $NODE_VERSION found"
else
    echo "✗ Node.js not found! Please install from https://nodejs.org/"
    exit 1
fi

# Install dependencies
echo ""
echo "Installing dependencies..."
if npm install; then
    echo "✓ Dependencies installed"
else
    echo "✗ Failed to install dependencies"
    exit 1
fi

# Generate icons
echo ""
echo "Generating icon files..."
if node scripts/create-simple-icons.js; then
    echo "✓ Icon files created"
else
    echo "✗ Failed to create icons"
    exit 1
fi

# Build extension
echo ""
echo "Building extension..."
if npm run build; then
    echo "✓ Extension built successfully"
else
    echo "✗ Build failed"
    exit 1
fi

echo ""
echo "✅ Setup Complete!"
echo ""

echo "Next steps:"
echo "1. Open Chrome and go to: chrome://extensions/"
echo "2. Enable 'Developer mode' (top right)"
echo "3. Click 'Load unpacked'"
echo "4. Select the 'dist' folder"
echo "5. Click the extension icon and configure your API key"
echo ""

echo "📚 Documentation:"
echo "   - QUICKSTART.md - Quick start guide"
echo "   - README.md - Full documentation"
echo "   - FEATURES.md - All features"
echo ""

echo "🎉 Happy browsing with AI assistance!"
echo ""

