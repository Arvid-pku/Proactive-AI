# 📦 Installation Guide

## Quick Start (5 minutes)

### Step 1: Prerequisites
Make sure you have:
- ✅ Node.js (v16+) - [Download here](https://nodejs.org/)
- ✅ Google Chrome browser
- ✅ OpenAI API key - [Get one here](https://platform.openai.com/api-keys)

### Step 2: Clone & Install
```bash
# Navigate to your project folder
cd C:\Study\Proactive-AI

# Install dependencies
npm install
```

### Step 3: Generate Icons
1. Open `src/icons/generate-icons.html` in your browser
2. Click all three download buttons
3. Save the PNG files in the `src/icons/` folder

### Step 4: Build Extension
```bash
npm run build
```

You should see a new `dist/` folder created.

### Step 5: Load in Chrome
1. Open Chrome and go to: `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `dist` folder in your project
5. The extension icon should appear in your toolbar! ✨

### Step 6: Configure API Key
1. Click the Proactive AI extension icon
2. Go to **Settings** tab
3. Enter your OpenAI API key
4. Click **Save API Key**

## 🎉 You're Done!

### Test It Out:
1. Go to any webpage (try Wikipedia or a math tutorial)
2. Hover over text, equations, or code
3. See the AI assistant appear! ✨

### Example Sites to Test:
- **Math**: Khan Academy, Wolfram MathWorld
- **Code**: GitHub, Stack Overflow
- **Text**: Wikipedia, Medium articles
- **Foreign Language**: News sites in other languages

## 🔧 Development Mode

If you want to modify the extension:

```bash
# Start development mode (auto-rebuild on changes)
npm run dev
```

After making changes:
1. Go to `chrome://extensions/`
2. Click the refresh icon on your extension
3. Reload the webpage you're testing

## 🐛 Troubleshooting

### "npm install" fails
- Make sure Node.js is installed: `node --version`
- Try deleting `node_modules` and `package-lock.json`, then run `npm install` again

### Extension doesn't appear in Chrome
- Check that you selected the `dist` folder, not the project root
- Make sure "Developer mode" is enabled
- Check for errors in `chrome://extensions/`

### No tools showing when hovering
- Verify API key is saved in settings
- Check browser console (F12) for errors
- Make sure you're selecting/hovering enough text (min 3 characters)
- Wait ~800ms after hovering (debounce delay)

### Build errors
- Make sure all dependencies installed: `npm install`
- Check Node.js version: `node --version` (should be v16+)
- Try: `rm -rf node_modules dist && npm install && npm run build`

## 📱 API Key Security

**Important**: Your API key is stored locally in Chrome's storage and is never sent to our servers. However:
- Don't share your API key
- Monitor your OpenAI usage at platform.openai.com
- The extension uses GPT-4o-mini (cost-effective model)
- Consider setting usage limits on your OpenAI account

## 🚀 Next Steps

- Read the [README.md](README.md) for full feature list
- Check out the code to understand how it works
- Customize tools in `src/utils/toolDefinitions.js`
- Add new content detectors in `src/utils/contentDetectors.js`

## 💡 Tips

1. **Selection Mode** is faster than hover mode - just highlight text!
2. Use **Save to Notes** to collect information while browsing
3. Check the popup (click extension icon) to view saved notes
4. The AI automatically detects content type - no manual selection needed!

---

Need help? The extension logs useful info to the browser console (F12 → Console).

