# ⚡ Quick Start Guide

Get up and running in **5 minutes**!

## 🎯 Prerequisites

You need:
1. ✅ **Node.js** installed → [Download](https://nodejs.org/)
2. ✅ **Google Chrome** browser
3. ✅ **OpenAI API key** → [Get here](https://platform.openai.com/api-keys)

## 🚀 Installation Steps

### Step 1: Install Dependencies (1 min)

Open terminal in the project folder and run:

```bash
npm install
```

Wait for packages to install...

### Step 2: Generate Icons (1 min)

```bash
node scripts/generate-icons.js
```

Then open `src/icons/generate-icons.html` in your browser and download all three PNG files to `src/icons/`.

### Step 3: Build Extension (1 min)

```bash
npm run build
```

You'll see a new `dist/` folder appear.

### Step 4: Load in Chrome (1 min)

1. Open Chrome
2. Go to: `chrome://extensions/`
3. Turn ON **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the `dist` folder
6. Done! 🎉

### Step 5: Configure API Key (1 min)

1. Click the extension icon in Chrome
2. Click **Settings** tab
3. Paste your OpenAI API key
4. Click **Save API Key**

## ✅ You're Ready!

### Test It Now:

1. **Go to Wikipedia** (or any article site)
2. **Hover over text** for 1 second
3. **See the AI assistant appear!** ✨

### Try These:

- 🧮 **Math**: Find an equation, hover, click "Graph Equation"
- 💻 **Code**: Go to GitHub, select code, click "Explain Code"
- 🌍 **Translation**: Find foreign text, select it, click "Translate"
- 📝 **Save**: Select any text, click "Save to Notes"
- 📷 **NEW - OCR**: Hover over images with text to extract and analyze!

## 🎓 How to Use

### Method 1: Hover
- Move mouse over text
- Wait ~1 second
- Tools appear automatically

### Method 2: Selection (Faster!)
- Highlight/select any text
- Tools appear instantly
- Click a tool
- Get results

### View Saved Notes:
- Click extension icon
- Go to "Notes" tab
- See all saved content

## 🐛 Troubleshooting

**Extension not showing?**
→ Check `chrome://extensions/` that it's enabled

**No tools appearing?**
→ Make sure API key is saved in Settings

**Build errors?**
→ Delete `node_modules` and run `npm install` again

**Icons missing?**
→ Download PNG files from `src/icons/generate-icons.html`

## 💡 Pro Tips

1. **Selection is faster** than hover - just highlight text
2. **Short selections work better** - be specific
3. **Save everything interesting** - notes are searchable
4. **Works on ANY website** - try it everywhere!

## 🎨 Customize

Want to modify it?

```bash
# Start development mode (auto-rebuild)
npm run dev
```

Then edit files in `src/` folder. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 📚 Next Steps

- Read [README.md](README.md) for full documentation
- Check [FEATURES.md](FEATURES.md) for all features
- See [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) for architecture

## 🎉 Enjoy!

You now have an AI-powered assistant for your browsing!

---

**Questions?** Check the documentation or open an issue.

**Having fun?** Consider contributing! See [CONTRIBUTING.md](CONTRIBUTING.md).

