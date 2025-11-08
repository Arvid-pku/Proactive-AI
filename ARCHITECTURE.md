# 🏗️ Architecture Documentation

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         WEB PAGE                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  User hovers/selects text, math, code, etc.          │  │
│  └────────────────────┬──────────────────────────────────┘  │
│                       │                                      │
│                       ▼                                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           CONTENT SCRIPT (content/index.js)           │  │
│  │  • DOM monitoring                                     │  │
│  │  • Mouse tracking                                     │  │
│  │  • Text extraction                                    │  │
│  │  • Content detection                                  │  │
│  └────────────────────┬──────────────────────────────────┘  │
└────────────────────────┼──────────────────────────────────────┘
                         │
                         │ postMessage
                         │
                         ▼
          ┌──────────────────────────────┐
          │   REACT UI (ui/index.jsx)    │
          │  • Floating window           │
          │  • Tool display              │
          │  • Results rendering         │
          └──────────┬───────────────────┘
                     │
                     │ chrome.runtime.sendMessage
                     │
                     ▼
    ┌────────────────────────────────────────┐
    │  BACKGROUND WORKER (background/index.js)│
    │  • OpenAI API calls                    │
    │  • Tool execution                      │
    │  • State management                    │
    └────────────┬───────────────────────────┘
                 │
                 │ fetch (API call)
                 │
                 ▼
        ┌────────────────────┐
        │   OpenAI API       │
        │   GPT-4o-mini      │
        └────────────────────┘
```

## Component Details

### 1. Content Script Layer

**File**: `src/content/index.js`

**Responsibilities**:
- Monitor DOM changes
- Track mouse position
- Detect hover events (with 800ms debounce)
- Capture text selection
- Extract content and context
- Inject React UI into page

**Key Functions**:
```javascript
handleHover(element)      // Process hover events
handleSelection()         // Process text selection
analyzeAndShowTools()     // Trigger AI analysis
injectUI()               // Inject React component
```

**Events Listened**:
- `mousemove` - Track cursor
- `mouseover` - Detect hover
- `mouseup` - Text selection
- `keyup` - Keyboard selection

### 2. Content Detection Layer

**File**: `src/utils/contentDetectors.js`

**Responsibilities**:
- Identify content types
- Extract clean text
- Get surrounding context
- Pattern matching

**Detectors**:
```javascript
detectMath()         // Math equations
detectCode()         // Code snippets
detectForeignLanguage() // Non-English text
detectChemical()     // Chemical formulas
detectHistorical()   // Dates & events
detectTable()        // Data tables
detectCitation()     // Academic references
detectURL()          // Links
```

**Algorithm**:
```
1. Extract text from element
2. Run through all detectors
3. Return array of types
4. Prioritize by relevance
```

### 3. Tool Definition Layer

**File**: `src/utils/toolDefinitions.js`

**Structure**:
```javascript
{
  id: 'tool_id',
  name: 'Display Name',
  description: 'What it does',
  icon: '🎯',
  contentTypes: ['math', 'code'],
  action: 'ACTION_NAME'
}
```

**18 Tools**:
- 3 Math tools
- 3 Code tools
- 3 Language tools
- 3 Content tools
- 6 Specialized tools

### 4. React UI Layer

**File**: `src/ui/index.jsx`

**Component Tree**:
```
ProactiveAI (Main Component)
├── Header
│   ├── Title
│   └── Close Button
├── Content View
│   ├── Preview Panel
│   ├── Content Type Badges
│   ├── Tool List
│   │   └── Tool Button × N
│   └── Loading Indicator
└── Result View
    ├── Back Button
    └── Result Display
        ├── Text Result
        ├── Success Result
        ├── URL Result
        ├── Audio Result
        └── Error Result
```

**State Management**:
```javascript
isVisible        // Show/hide UI
position        // X,Y coordinates
tools           // Suggested tools
content         // Preview text
fullContent     // Complete text
contentTypes    // Detected types
result          // Tool result
loading         // Loading state
activeView      // 'tools' or 'result'
```

**Communication**:
- Listens: `window.message` events
- Sends: `window.postMessage` to content script

### 5. Background Service Worker

**File**: `src/background/index.js`

**Responsibilities**:
- OpenAI API integration
- Tool execution
- API key management
- State persistence

**Message Handlers**:
```javascript
GET_TOOL_SUGGESTIONS  // AI analysis
EXECUTE_TOOL         // Run tool action
SET_API_KEY          // Save API key
```

**Tool Handlers**:
```javascript
graph_equation()      // Open Desmos
explain_math()        // AI explanation
solve_equation()      // AI solution
explain_code()        // Code analysis
debug_code()         // Bug detection
improve_code()       // Optimization
translate()          // Translation
summarize()          // Summarization
explain_text()       // Simplification
save_note()          // Local storage
pronounce()          // Text-to-speech
```

**API Integration**:
```javascript
const client = new OpenAI({ apiKey });
const response = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [...],
  temperature: 0.3,
  max_tokens: 500
});
```

### 6. Popup Interface

**File**: `src/popup/index.jsx`

**Features**:
- Settings configuration
- Saved notes management
- Usage instructions
- API key input

**Tabs**:
1. **Notes Tab**:
   - List saved notes
   - Delete individual notes
   - Clear all notes
   - Export to JSON

2. **Settings Tab**:
   - API key input
   - How to use guide
   - Feature list

### 7. Chrome Extension Integration

**Manifest V3** (`manifest.json`):
```json
{
  "manifest_version": 3,
  "permissions": ["activeTab", "storage"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "css": ["content.css"]
  }]
}
```

## Data Flow Diagrams

### Tool Suggestion Flow

```
User Action (Hover/Select)
    ↓
Extract Text + Context
    ↓
Detect Content Types
    ↓
Send to Background Worker
    ↓
Call OpenAI API
    ↓
Parse Tool IDs
    ↓
Return to Content Script
    ↓
Display in React UI
```

### Tool Execution Flow

```
User Clicks Tool
    ↓
Send Tool ID + Content to Background
    ↓
Execute Tool Handler
    ↓
(If AI needed) Call OpenAI
    ↓
Generate Result
    ↓
Return to Content Script
    ↓
Display in React UI
    ↓
Handle Special Actions (URL, Audio)
```

## State Management

### Content Script State
```javascript
{
  mousePosition: { x, y },
  selectedElement: HTMLElement,
  selectedText: string,
  debounceTimer: number,
  uiInjected: boolean
}
```

### UI Component State
```javascript
{
  isVisible: boolean,
  position: { x, y },
  tools: string[],
  content: string,
  fullContent: string,
  contentTypes: string[],
  result: object,
  loading: boolean,
  activeView: 'tools' | 'result'
}
```

### Chrome Storage
```javascript
{
  apiKey: string,
  notes: [{
    id: number,
    content: string,
    timestamp: string
  }]
}
```

## Security Architecture

### API Key Storage
```
User Input
    ↓
Chrome Storage API (encrypted)
    ↓
Background Worker reads
    ↓
OpenAI API calls
```

**Security Measures**:
- API key never sent to any server except OpenAI
- Stored in Chrome's local storage (encrypted by Chrome)
- Not accessible to web pages
- Only background worker has access

### Content Isolation
```
Web Page ←→ Content Script ←→ Background Worker
   |              |                    |
   Isolated   postMessage        chrome.runtime
```

## Performance Optimizations

### 1. Debouncing
- 800ms delay on hover prevents excessive API calls
- Instant on text selection for better UX

### 2. Text Limiting
- Content sent to AI limited to 500 characters
- Context limited to 500 characters
- Prevents token waste

### 3. Lazy Loading
- UI only injected when first needed
- Tools loaded dynamically
- React components optimize re-renders

### 4. Caching
- API responses could be cached (future)
- Tool definitions loaded once
- Detectors compiled once

## Build System

**Webpack Configuration**:
```
Entry Points:
  - content.js
  - background.js
  - ui.js
  - popup.js

Loaders:
  - babel-loader (JSX → JS)
  - css-loader (CSS)
  - style-loader (Inject CSS)

Plugins:
  - CopyWebpackPlugin (Static files)
  - HtmlWebpackPlugin (HTML generation)

Output:
  - dist/ folder
  - Minified JS
  - Bundled CSS
```

## Extension Lifecycle

### Installation
```
1. User loads unpacked extension
2. Chrome reads manifest.json
3. Registers background service worker
4. Registers content scripts
5. Creates extension icon
```

### Page Load
```
1. User navigates to webpage
2. Content script injected
3. Monitors DOM
4. Waits for user interaction
```

### Interaction
```
1. User hovers/selects
2. Content script activates
3. Injects React UI (if needed)
4. Sends message to background
5. Background calls OpenAI
6. Tools displayed
7. User clicks tool
8. Tool executes
9. Result shown
```

## Error Handling

### API Errors
```javascript
try {
  // OpenAI call
} catch (error) {
  // Fallback to rule-based tools
  return fallbackTools[contentType];
}
```

### Build Errors
- Webpack catches syntax errors
- Console shows detailed errors
- Source maps for debugging

### Runtime Errors
- Try-catch blocks around API calls
- Graceful degradation
- User-friendly error messages

## Testing Strategy

### Manual Testing
1. Test on various websites
2. Try all content types
3. Verify all tools work
4. Check error handling

### Future Automated Testing
- Unit tests for detectors
- Integration tests for API
- E2E tests with Playwright
- Performance benchmarks

## Scalability Considerations

### Adding New Tools
1. Define in `toolDefinitions.js`
2. Add handler in `background/index.js`
3. Test with various content
4. Update documentation

### Adding New Content Types
1. Create detector in `contentDetectors.js`
2. Update `analyzeContent()`
3. Add to tool definitions
4. Test detection accuracy

### Multi-Language Support
1. Create i18n files
2. Update UI strings
3. Add language detection
4. Test with translations

---

**Architecture designed for**:
- 🚀 Performance
- 🔒 Security
- 📈 Scalability
- 🛠️ Maintainability
- 🎨 Great UX

