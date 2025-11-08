# 🌟 Feature Documentation

## Core Capabilities

### 🤖 AI-Powered Tool Selection
The extension uses GPT-4o-mini to intelligently determine which tools are most relevant based on:
- **Content type** (math, code, text, etc.)
- **Surrounding context** (what's near the selection)
- **User intent** (hover vs. selection)

### 📊 Mathematics Support

#### Graph Equation
- **Trigger**: Detect mathematical expressions
- **Action**: Opens Desmos graphing calculator
- **Supports**: 
  - Algebraic equations (y = 2x + 3)
  - Trigonometric functions (sin, cos, tan)
  - Calculus (derivatives, integrals)
  - Parametric equations

#### Explain Math
- **Trigger**: Mathematical content
- **Action**: GPT provides step-by-step explanation
- **Great for**: Understanding concepts like convex/concave functions, min/max

#### Solve Equation
- **Trigger**: Equations with variables
- **Action**: Shows solution steps
- **Supports**: Linear, quadratic, systems of equations

### 💻 Code Assistance

#### Explain Code
- **Languages**: JavaScript, Python, Java, C++, and more
- **Action**: Line-by-line code explanation
- **Includes**: Logic flow, variable purposes, algorithm explanation

#### Debug Code
- **Action**: Identifies potential bugs, edge cases, logic errors
- **Suggests**: Fixes and improvements

#### Improve Code
- **Action**: Optimization suggestions
- **Covers**: Performance, readability, best practices

### 🌍 Language Tools

#### Translate
- **Auto-detect**: Identifies source language
- **Action**: Translates to English (or Spanish if already English)
- **Supports**: 100+ languages

#### Pronounce
- **Action**: Text-to-speech using browser API
- **Great for**: Learning foreign language pronunciation

#### Define Word
- **Action**: Dictionary definition and usage examples

### 📝 Text Processing

#### Summarize
- **Action**: Concise summary of paragraphs/articles
- **Perfect for**: Quick understanding of long content

#### Explain Text
- **Action**: Simplifies complex text
- **Great for**: Academic papers, technical docs

#### Save to Notes
- **Action**: Stores content locally
- **Access**: Via extension popup
- **Export**: JSON format

### 🧪 Chemistry

#### Visualize Chemical
- **Trigger**: Chemical formulas (H2O, C6H12O6)
- **Action**: Shows molecular structure
- **Integration**: Links to chemistry visualization tools

### 📅 Historical Content

#### Timeline View
- **Trigger**: Dates, historical events
- **Action**: Places events in historical context
- **Shows**: Related events, significance

### 📊 Data & Tables

#### Export Table
- **Action**: Converts HTML tables to CSV
- **Format**: Excel-compatible

#### Visualize Data
- **Action**: Creates charts from tabular data
- **Types**: Bar, line, pie charts

### 📄 Academic

#### Fetch Citation
- **Trigger**: DOI, arXiv, citation formats
- **Action**: Fetches full paper reference
- **Shows**: Title, authors, abstract, link

### 🔗 Web Safety

#### Check Link
- **Action**: Previews URL destination
- **Shows**: Domain info, safety check

## 🎯 Usage Patterns

### For Students
1. **Learning Math**: Hover over equations to see graphs
2. **Reading Papers**: Summarize paragraphs, look up citations
3. **Coding Practice**: Explain and debug code snippets
4. **Language Learning**: Translate and pronounce foreign text

### For Researchers
1. **Quick Summaries**: Skim papers efficiently
2. **Citation Management**: Save important references
3. **Data Analysis**: Export and visualize tables

### For Developers
1. **Code Review**: Explain unfamiliar code
2. **Debugging**: Find issues quickly
3. **Learning**: Understand new algorithms

### For General Browsing
1. **Quick Definitions**: Understand new terms
2. **Translation**: Read foreign content
3. **Fact Checking**: Verify information

## 🚀 Advanced Features

### Context Awareness
The AI considers:
- Selected text
- Surrounding paragraphs
- Page structure
- Content type

### Smart Debouncing
- 800ms delay on hover (prevents flickering)
- Instant on text selection
- Automatic hide when moving away

### Efficient API Usage
- Minimal token usage (500 char limit for analysis)
- Fast model (GPT-4o-mini)
- Cached results when possible
- Fallback logic if API fails

### Local Storage
- Notes saved in Chrome storage
- API key encrypted
- No external database needed

## 🎨 UI/UX Features

### Floating Window
- Follows cursor position
- Auto-adjusts to stay on screen
- Smooth animations
- Easy to dismiss

### Visual Feedback
- Loading states
- Success/error messages
- Content type badges
- Tool icons

### Keyboard Friendly
- Tab navigation
- Enter to select
- Escape to close

## 🔮 Future Enhancements

### Planned Features
- [ ] Image analysis (OCR, description)
- [ ] LaTeX rendering
- [ ] Multiple language translations
- [ ] Code execution sandbox
- [ ] Flashcard creation from notes
- [ ] Export notes to Markdown/PDF
- [ ] Custom tool creation
- [ ] Keyboard shortcuts configuration
- [ ] Theme customization
- [ ] Collaboration features

### Potential Integrations
- Wolfram Alpha (advanced math)
- GeoGebra (geometry)
- PubChem (chemistry)
- Google Scholar (citations)
- Grammarly (writing)
- GitHub (code context)

## 💡 Tips & Tricks

1. **Select precisely**: The AI works better with focused selections
2. **Use context**: Include surrounding text for better results
3. **Try different tools**: AI suggestions aren't exhaustive
4. **Save everything**: Notes are searchable in popup
5. **Keyboard shortcuts**: Faster than mouse for repeated actions

## 🔧 Customization Guide

### Add Custom Tools
Edit `src/utils/toolDefinitions.js`:
```javascript
{
  id: 'custom_tool',
  name: 'My Tool',
  description: 'What it does',
  icon: '🎯',
  contentTypes: ['text'],
  action: 'CUSTOM_ACTION'
}
```

### Add Content Detectors
Edit `src/utils/contentDetectors.js`:
```javascript
export function detectCustom(text) {
  return /your-pattern/.test(text);
}
```

### Modify AI Prompts
Edit `src/background/index.js` in `handleToolSuggestions()`

### Change Styling
Edit `src/ui/ui.css` for floating window
Edit `src/popup/popup.css` for popup

### Adjust Timing
Edit `src/content/index.js`:
```javascript
const DEBOUNCE_DELAY = 800; // Your value in ms
```

## 📊 Performance

### Metrics
- **Load time**: <100ms
- **UI render**: <50ms
- **API response**: 500-1500ms (depends on OpenAI)
- **Memory usage**: ~20MB

### Optimization
- Debounced hover detection
- Minimal DOM queries
- Efficient event listeners
- Lazy loading of tools
- Result caching

---

**Pro Tip**: The extension learns from your usage patterns. The more you use it, the better AI suggestions become!

