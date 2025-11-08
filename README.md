# 🎯 Proactive AI Assistant

An intelligent Chrome extension that provides context-aware helper tools powered by AI. Hover or select text, math equations, code snippets, or any content on the web to get instant AI-powered assistance!

## ✨ Features

### 🧮 **Math Assistance**
- **Graph Equations**: Visualize functions using Desmos integration
- **Explain Math**: Get step-by-step explanations of complex concepts
- **Solve Equations**: Find solutions with detailed working

### 💻 **Code Help**
- **Explain Code**: Understand what code snippets do
- **Debug Code**: Find and fix potential issues
- **Improve Code**: Get optimization suggestions

### 📝 **Text Tools**
- **Summarize**: Get concise summaries of long paragraphs
- **Explain**: Simplify complex text
- **Translate**: Convert text to other languages
- **Define**: Get dictionary definitions
- **Save to Notes**: Store important information

### 🧪 **Advanced Features**
- **Chemical Structures**: Visualize molecular 3D structures
- **Historical Timelines**: View events in historical context
- **Data Visualization**: Create charts from tables
- **Citation Lookup**: Fetch academic papers
- **Link Safety**: Preview and verify URLs
- **Text-to-Speech**: Hear pronunciations

## 🚀 Installation

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- OpenAI API key

### Steps

1. **Clone the repository**
```bash
git clone <repository-url>
cd Proactive-AI
```

2. **Install dependencies**
```bash
npm install
```

3. **Build the extension**
```bash
npm run build
```

4. **Load in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist` folder

5. **Configure API Key**
   - Click the extension icon in Chrome toolbar
   - Go to Settings tab
   - Enter your OpenAI API key
   - Click "Save API Key"

## 🎮 Usage

### Hover Mode
Simply hover your mouse over:
- Mathematical equations → Get graphing and explanation tools
- Code snippets → Get debugging and explanation options
- Foreign text → Get translation and pronunciation
- Any text → Get summarization and explanation

### Selection Mode
Highlight/select any text to:
- See AI-suggested tools instantly
- Choose from context-aware actions
- Get immediate results

### The floating assistant will automatically:
1. Detect the type of content (math, code, text, etc.)
2. Send context to AI for analysis
3. Show the most relevant tools
4. Execute actions when you click

## 🏗️ Project Structure

```
Proactive-AI/
├── src/
│   ├── background/          # Service worker for API calls
│   │   └── index.js
│   ├── content/            # DOM monitoring and injection
│   │   ├── index.js
│   │   └── content.css
│   ├── ui/                 # React floating assistant
│   │   ├── index.jsx
│   │   ├── ui.html
│   │   └── ui.css
│   ├── popup/              # Extension popup
│   │   ├── index.jsx
│   │   ├── popup.html
│   │   └── popup.css
│   ├── utils/              # Helper functions
│   │   ├── contentDetectors.js
│   │   └── toolDefinitions.js
│   └── icons/              # Extension icons
├── manifest.json           # Chrome extension manifest
├── webpack.config.js       # Build configuration
├── package.json
└── README.md
```

## 🛠️ Development

### Development Mode
```bash
npm run dev
```
This starts webpack in watch mode. Changes will automatically rebuild.

### Production Build
```bash
npm run build
```

### Reload Extension
After making changes:
1. Go to `chrome://extensions/`
2. Click the refresh icon on the Proactive AI Assistant card
3. Refresh the webpage you're testing on

## 🧠 How It Works

1. **Content Detection**: The content script monitors the DOM and tracks mouse position
2. **Context Analysis**: When you hover/select, it extracts text and surrounding context
3. **AI Processing**: Content + context is sent to GPT-4o-mini (fastest available model)
4. **Tool Suggestion**: AI determines which tools are most relevant
5. **User Action**: You click a tool button
6. **Execution**: The tool runs (API call, open URL, save data, etc.)
7. **Result Display**: Output shown in the floating window

## 🔒 Privacy & Security

- **Local Storage**: API key stored locally in Chrome storage
- **No Backend**: Extension runs entirely in your browser
- **OpenAI Only**: Data only sent to OpenAI API
- **No Tracking**: We don't collect or store any usage data

## 🎨 Customization

### Adding New Tools

1. **Define the tool** in `src/utils/toolDefinitions.js`:
```javascript
{
  id: 'my_tool',
  name: 'My Tool',
  description: 'What it does',
  icon: '🎯',
  contentTypes: ['text'],
  action: 'MY_TOOL'
}
```

2. **Add handler** in `src/background/index.js`:
```javascript
my_tool: () => myToolHandler(content)
```

3. **Create handler function**:
```javascript
async function myToolHandler(content) {
  // Your logic here
  return { type: 'text', content: 'Result' };
}
```

### Adding New Content Detectors

Edit `src/utils/contentDetectors.js`:
```javascript
export function detectMyContent(text) {
  // Detection logic
  return /pattern/.test(text);
}
```

## 🐛 Troubleshooting

### Extension not appearing
- Make sure it's enabled in `chrome://extensions/`
- Check that the build completed successfully
- Reload the extension

### No tools showing
- Verify your API key is set correctly
- Check browser console for errors (F12)
- Ensure you're hovering/selecting enough text (min 3 characters)

### API errors
- Confirm API key is valid
- Check OpenAI account has credits
- Look at background service worker logs

## 📦 Technologies Used

- **React**: UI components
- **OpenAI API**: GPT-4o-mini for content analysis
- **Webpack**: Bundling
- **Chrome Extension API**: Browser integration
- **Babel**: JavaScript transpilation

## 🤝 Contributing

This is a hackathon project! Feel free to:
- Add new content detectors
- Create additional tools
- Improve UI/UX
- Optimize performance
- Fix bugs

## 📄 License

MIT License - feel free to use and modify!

## 🎯 Roadmap / Ideas

- [ ] Add support for images (OCR, description, search)
- [ ] Integrate more graphing tools (GeoGebra, Wolfram Alpha)
- [ ] Add LaTeX rendering for math
- [ ] Support for more languages
- [ ] Chemistry equation balancing
- [ ] Code execution sandbox
- [ ] Export notes to various formats
- [ ] Keyboard shortcuts
- [ ] Customizable themes
- [ ] Context menu integration

## 👥 Team

Built with ❤️ for learners everywhere during the AI Hackathon!

## 🙏 Acknowledgments

- OpenAI for GPT-4o-mini API
- Desmos for graphing calculator
- Chrome Extensions documentation
- React team

---

**Note**: This extension uses the OpenAI API and requires an API key. Make sure you understand OpenAI's pricing before extensive use. GPT-4o-mini is designed to be fast and cost-effective.

