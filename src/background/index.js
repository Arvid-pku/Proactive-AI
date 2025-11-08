/**
 * Background Service Worker
 * Handles API calls to OpenAI and manages extension state
 */

import OpenAI from 'openai';
import { create, all } from 'mathjs';

const math = create(all);
math.config({ number: 'number', precision: 14 });

// Initialize OpenAI client
let openaiClient = null;

// Get API key from storage or use default
async function getOpenAIClient() {
  if (openaiClient) return openaiClient;
  
  const { apiKey } = await chrome.storage.local.get('apiKey');
  const key = apiKey || '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';
  
  if (!key) {
    throw new Error('No API key configured. Please set your OpenAI API key in the extension settings.');
  }
  
  console.log('Initializing OpenAI client with API key:', key.substring(0, 20) + '...');
  
  openaiClient = new OpenAI({
    apiKey: key,
    dangerouslyAllowBrowser: true // Note: In production, API calls should go through a backend
  });
  
  return openaiClient;
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_TOOL_SUGGESTIONS') {
    handleToolSuggestions(request.data).then(sendResponse);
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'OPEN_SIDE_PANEL') {
    // Open side panel for the correct window/tab
    // Prefer the sender's tab/window when available (content script / FAB click)
    (async () => {
      try {
        // 1) Open ASAP to preserve any user gesture context
        const windowId = sender?.tab?.windowId ?? (await chrome.windows.getLastFocused()).id;
        try {
          await chrome.sidePanel.open({ windowId });
          console.log('✅ Side panel opened successfully');
        } catch (error) {
          console.error('❌ Error opening side panel:', error);
          sendResponse({ success: false, error: error.message });
          return;
        }

        // 2) Best-effort ensure path/options for this tab (non-blocking for open)
        const senderTab = sender?.tab;
        if (senderTab?.id) {
          await chrome.sidePanel.setOptions({
            tabId: senderTab.id,
            path: 'sidepanel.html',
            enabled: true
          }).catch(() => { /* best-effort */ });
        }

        sendResponse({ success: true });
      } catch (error) {
        console.error('❌ Unexpected error while opening side panel:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
  
  if (request.action === 'EXECUTE_TOOL') {
    handleToolExecution(request.data).then(sendResponse);
    return true;
  }
  
  if (request.action === 'SET_API_KEY') {
    chrome.storage.local.set({ apiKey: request.apiKey }).then(() => {
      openaiClient = null; // Reset client
      console.log('API key updated successfully');
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Error saving API key:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

/**
 * Get AI suggestions for which tools to show
 */
async function handleToolSuggestions({ content, context, contentTypes }) {
  console.log('Getting tool suggestions for content types:', contentTypes);
  
  try {
    const client = await getOpenAIClient();
    
    const systemPrompt = `You are a helpful assistant that determines which tools would be most useful for selected content.
Available content types: math, code, text, foreign, chemical, historical, table, citation, url

Available tools:
- graph_equation: Graph mathematical equations (for math)
- explain_math: Explain mathematical concepts (for math)
- solve_equation: Solve mathematical equations (for math)
- explain_code: Explain code snippets (for code)
- debug_code: Debug code (for code)
- improve_code: Suggest code improvements (for code)
- translate: Translate text (for text, foreign)
- summarize: Summarize content (for text)
- explain_text: Explain in simpler terms (for text)
- save_note: Save to notes (for any)
- define_word: Dictionary definition (for text)
- visualize_chemical: Show 3D molecular structure (for chemical)
- timeline_view: Historical timeline (for historical)
- export_table: Export data as CSV (for table)
- visualize_data: Create charts (for table)
- fetch_citation: Fetch paper (for citation)
- check_link: Check URL safety (for url)
- pronounce: Text-to-speech (for foreign, text)

Respond with ONLY a JSON array of tool IDs, ordered by relevance. Maximum 4 tools.
Example: ["graph_equation", "explain_math", "save_note"]`;

    const userPrompt = `Content: "${content}"
Context: "${context}"
Detected types: ${contentTypes.join(', ')}

Which tools should be shown? Return JSON array of tool IDs only.`;

    const response = await client.responses.create({
      model: 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemPrompt }]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: userPrompt }]
        }
      ]
    });

    const toolIds = JSON.parse(response.output_text);
    
    return { 
      success: true, 
      tools: toolIds,
      timestamp: Date.now()
    };
    
  } catch (error) {
    console.error('Error getting tool suggestions:', error);
    
    // Fallback: Return basic tools based on content type
    const fallbackTools = {
      math: ['graph_equation', 'explain_math'],
      code: ['explain_code', 'debug_code'],
      text: ['summarize', 'explain_text'],
      foreign: ['translate', 'pronounce'],
      chemical: ['visualize_chemical'],
      table: ['export_table', 'visualize_data']
    };
    
    const tools = contentTypes.flatMap(type => fallbackTools[type] || [])
      .slice(0, 4);
    
    return { 
      success: true, 
      tools: tools.length > 0 ? tools : ['save_note', 'summarize'],
      fallback: true 
    };
  }
}

/**
 * Execute a specific tool action
 */
async function handleToolExecution({ toolId, content, context }) {
  console.log('Executing tool:', toolId, 'with content length:', content?.length);
  
  try {
    // Initialize client early to catch API key issues
    const client = await getOpenAIClient();
    
    const toolHandlers = {
      graph_equation: () => graphEquation(content),
      explain_math: () => explainWithAI(content, 'Explain this mathematical concept step by step'),
      solve_equation: () => explainWithAI(content, 'Solve this equation and show all steps'),
      explain_code: () => explainWithAI(content, 'Explain what this code does, line by line'),
      debug_code: () => explainWithAI(content, 'Find potential bugs or issues in this code'),
      improve_code: () => explainWithAI(content, 'Suggest improvements to this code'),
      translate: () => translateText(content),
      summarize: () => explainWithAI(content, 'Provide a concise summary'),
      explain_text: () => explainWithAI(content, 'Explain this in simpler terms'),
      save_note: () => saveNote(content),
      define_word: () => explainWithAI(content, 'Define this word or phrase'),
      pronounce: () => pronounceText(content),
      visualize_chemical: () => visualizeChemical(content),
      timeline_view: () => createTimeline(content),
      export_table: () => exportTableData(content, context),
      visualize_data: () => visualizeData(content),
      fetch_citation: () => fetchCitation(content),
      check_link: () => checkLink(content)
    };
    
    const handler = toolHandlers[toolId];
    if (!handler) {
      console.error('Unknown tool:', toolId);
      return { success: false, error: 'Unknown tool: ' + toolId };
    }
    
    console.log('Calling handler for:', toolId);
    const result = await handler();
    console.log('Tool execution completed:', toolId);
    
    return { success: true, result };
    
  } catch (error) {
    console.error('Error executing tool:', error);
    return { 
      success: false, 
      error: error.message || 'An error occurred while executing the tool'
    };
  }
}

// Helper: Graph equation using Plotly (opens side panel)
async function graphEquation(equation) {
  const fallbackEquation = equation.replace(/\\|{|}/g, '').trim();

  try {
    const client = await getOpenAIClient();

    console.log('Parsing equation for Plotly:', equation);

    const response = await client.responses.create({
      model: 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content: [{
            type: 'input_text',
            text: `You convert mathematical input into clean, explicit functions of x that can be plotted with Plotly.
Rules:
- Output a SINGLE line with equations separated by semicolons, e.g. "y=x^2; y=-x^2".
- Each equation must be solved for y and may only reference x, numeric constants, and standard math functions (sin, cos, tan, asin, acos, atan, exp, log, ln, abs, sqrt, sinh, cosh, tanh).
- Replace words, named functions, or parameters (lambda, penalty, ObjectiveFunction, etc.) with numeric constants.
- Use ASCII characters only (use ^ for exponents) and avoid Unicode math symbols.
- Do not include narration or labels—return only the cleaned equations.`
          }]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: `Convert for Plotly: ${equation}` }]
        }
      ]
    });

    const normalizedEquations = response.output_text.trim();
    console.log('Normalized equation(s):', normalizedEquations);

    const sanitizedEquations = sanitizeEquationText(normalizedEquations);
    const graphPayload = buildPlotlyPayload(sanitizedEquations);

    await persistGraphPayload({
      ...graphPayload,
      originalEquation: equation
    });

    notifySidePanel(graphPayload, equation);

    return {
      type: 'graph',
      instruction: '📊 Equation graphed! View it here or open the side panel for a larger chart.',
      originalEquation: equation,
      equation: graphPayload.equations.join('; '),
      graph: {
        traces: graphPayload.traces,
        layout: graphPayload.layout
      }
    };
  } catch (error) {
    console.error('Equation parsing error:', error);

    try {
  const fallbackText = sanitizeEquationText(fallbackEquation.includes('=') ? fallbackEquation : `y=${fallbackEquation}`);
  const graphPayload = buildPlotlyPayload(fallbackText);
      await persistGraphPayload({
        ...graphPayload,
        originalEquation: equation
      });

      notifySidePanel(graphPayload, equation);

      return {
        type: 'graph',
        instruction: '📊 Showing fallback graph. Review the plot in the side panel.',
        originalEquation: equation,
        equation: graphPayload.equations.join('; '),
        graph: {
          traces: graphPayload.traces,
          layout: graphPayload.layout
        }
      };
    } catch (fallbackError) {
      console.error('Fallback graph generation failed:', fallbackError);
      throw new Error('Unable to generate a graph for the selected equation.');
    }
  }
}

function buildPlotlyPayload(equationText) {
  const parts = equationText
    .split(/[;\n]/)
    .map(eq => eq.trim())
    .filter(Boolean);

  if (!parts.length) {
    throw new Error('No plottable equations returned.');
  }

  const xValues = generateXValues();
  const traces = [];

  parts.forEach((raw, index) => {
    const expression = extractExplicitExpression(raw);
    if (!expression) {
      console.warn('Skipping unsupported equation:', raw);
      return;
    }

    try {
      const compiled = math.compile(expression);
      const parameterDefaults = getParameterDefaults(expression);
      const scope = { ...parameterDefaults, x: 0 };
      const yValues = xValues.map(x => {
        try {
          scope.x = x;
          const value = compiled.evaluate(scope);
          const numeric = extractNumericValue(value);
          return Number.isFinite(numeric) ? Number(numeric) : null;
        } catch {
          return null;
        }
      });

      if (yValues.every(v => v === null)) {
        console.warn('All values undefined for equation:', raw);
        return;
      }

      traces.push({
        x: [...xValues],
        y: yValues,
        mode: 'lines',
        name: raw,
        hovertemplate: 'x=%{x:.2f}<br>y=%{y:.2f}<extra></extra>'
      });
    } catch (compileError) {
      console.warn('Failed to compile equation:', raw, compileError);
    }
  });

  if (!traces.length) {
    throw new Error('Unable to generate any plot traces from the equation.');
  }

  const layout = {
    title: { text: 'Equation Graph', font: { size: 16 } },
    margin: { t: 40, r: 20, b: 40, l: 50 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    xaxis: { title: 'x', zeroline: true, zerolinecolor: '#ccc' },
    yaxis: { title: 'y', zeroline: true, zerolinecolor: '#ccc' },
    showlegend: traces.length > 1
  };

  return {
    traces,
    layout,
    equations: parts
  };
}

function extractExplicitExpression(raw) {
  if (!raw) return null;
  let expression = raw.trim();

  const explicitRegex = /^(y|f\s*\(\s*x\s*\))\s*=\s*/i;
  if (explicitRegex.test(expression)) {
    return expression.replace(explicitRegex, '').trim();
  }

  if (expression.includes('=')) {
    const [left, right] = expression.split('=').map(part => part.trim());
    if (/^(y|f\s*\(\s*x\s*\))$/i.test(left)) {
      return right;
    }
    if (/^(y|f\s*\(\s*x\s*\))$/i.test(right)) {
      return left;
    }
    return null;
  }

  return expression;
}

function generateXValues() {
  const points = [];
  const steps = 200;
  const min = -10;
  const max = 10;
  const stepSize = (max - min) / steps;

  for (let i = 0; i <= steps; i++) {
    points.push(Number((min + stepSize * i).toFixed(4)));
  }

  return points;
}

async function persistGraphPayload({ traces, layout, equations, originalEquation }) {
  await chrome.storage.local.set({
    pendingGraph: {
      traces,
      layout,
      equations,
      originalEquation,
      timestamp: Date.now()
    }
  });

  console.log('✅ Graph data saved for side panel');
}

function notifySidePanel(graphPayload, originalEquation) {
  setTimeout(() => {
    chrome.runtime.sendMessage({
      action: 'GRAPH_EQUATION',
      graphData: {
        traces: graphPayload.traces,
        layout: graphPayload.layout,
        equations: graphPayload.equations
      },
      originalEquation
    }).catch(() => {
      console.log('Side panel not open yet, graph stored for later');
    });
  }, 100);
}

function sanitizeEquationText(text) {
  if (!text) {
    return '';
  }

  let cleaned = String(text)
    .replace(/\r?\n+/g, ';')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/λ/gi, '1')
    .replace(/∑/g, '')
    .replace(/Objective\s*Function\s*=*/gi, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/;+\s*;/g, ';');

  cleaned = cleaned.replace(/\b([a-zA-Z][a-zA-Z0-9_]*)\s*\(\s*x\s*\)/g, (match, name) => {
    const lower = name.toLowerCase();
    return ALLOWED_FUNCTIONS.has(lower) ? `${lower}(x)` : 'x';
  });

  cleaned = cleaned
    .replace(/\bpenalty\d*\b/gi, '1')
    .replace(/\bmargin\d*\b/gi, '1')
    .replace(/\blambda\b/gi, '1')
    .replace(/\bobjective\b/gi, '')
    .replace(/\bfunction\b/gi, '')
    .replace(/1\s*\(\s*x\s*\)/g, 'x');

  return cleaned
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .join('; ');
}

function extractNumericValue(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (value && typeof value.re === 'number') {
    return value.re;
  }
  if (value && typeof value.toNumber === 'function') {
    try {
      return value.toNumber();
    } catch {
      return NaN;
    }
  }
  return NaN;
}

const ALLOWED_FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'exp', 'log', 'ln', 'log10', 'log2', 'abs', 'sqrt',
  'sec', 'csc', 'cot'
]);

const ALLOWED_SYMBOLS = new Set(['x', 'pi', 'e', 'tau', 'phi', 'PI', 'E', 'TAU', 'PHI', 'Infinity', 'NaN']);

function getParameterDefaults(expression) {
  try {
    const node = math.parse(expression);
    const params = new Set();
    node.traverse(child => {
      if (child?.isSymbolNode) {
        params.add(child.name);
      }
    });

    const defaults = {};
    params.forEach(name => {
      if (ALLOWED_SYMBOLS.has(name) || ALLOWED_FUNCTIONS.has(name.toLowerCase())) {
        return;
      }
      if (typeof math[name] === 'function') {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(math, name) && typeof math[name] === 'number') {
        return;
      }
      defaults[name] = 1;
    });

    return defaults;
  } catch (error) {
    console.warn('Parameter extraction failed:', error);
    return {};
  }
}

// Helper: Explain using AI
async function explainWithAI(content, instruction) {
  try {
    const client = await getOpenAIClient();
    
    console.log('Calling OpenAI API for:', instruction);
    
    const response = await client.responses.create({
      model: 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: 'You are a helpful teacher and tutor.' }]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: `${instruction}:\n\n${content}` }]
        }
      ]
    });
    
    console.log('OpenAI API response received');
    
    return {
      type: 'text',
      content: response.output_text
    };
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw new Error(`AI request failed: ${error.message}`);
  }
}

// Helper: Translate text
async function translateText(content) {
  try {
    const client = await getOpenAIClient();
    
    console.log('Calling OpenAI API for translation');
    
    const response = await client.responses.create({
      model: 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: 'You are a translator. Detect the language and translate to English. If already in English, translate to Spanish.' }]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: content }]
        }
      ]
    });
    
    console.log('Translation completed');
    
    return {
      type: 'text',
      content: response.output_text
    };
  } catch (error) {
    console.error('Translation API error:', error);
    throw new Error(`Translation failed: ${error.message}`);
  }
}

// Helper: Save note
function saveNote(content) {
  const timestamp = new Date().toISOString();
  
  return chrome.storage.local.get('notes').then(({ notes = [] }) => {
    notes.unshift({
      content,
      timestamp,
      id: Date.now()
    });
    
    return chrome.storage.local.set({ notes }).then(() => ({
      type: 'success',
      message: 'Saved to notes!',
      count: notes.length
    }));
  });
}

// Helper: Text-to-speech
function pronounceText(text) {
  return {
    type: 'audio',
    text: text,
    instruction: 'Use browser text-to-speech'
  };
}

// Helper: Visualize chemical structure
function visualizeChemical(formula) {
  // Clean the formula
  const cleaned = formula.trim().replace(/\s+/g, '');
  
  // Use PubChem for 3D visualization
  const pubchemUrl = `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(cleaned)}`;
  
  return {
    type: 'url',
    url: pubchemUrl,
    formula: cleaned,
    instruction: 'Opening PubChem to visualize the molecular structure. Search for your compound to see 3D structure.'
  };
}

// Helper: Create historical timeline
async function createTimeline(content) {
  try {
    const client = await getOpenAIClient();
    
    console.log('Creating timeline for historical content');
    
    const response = await client.responses.create({
      model: 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: 'You are a history expert. Create a timeline of events related to the given content. Include dates, events, and brief descriptions.' }]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: `Create a timeline for: ${content}` }]
        }
      ]
    });
    
    console.log('Timeline created');
    
    return {
      type: 'text',
      content: response.output_text
    };
  } catch (error) {
    console.error('Timeline creation error:', error);
    throw new Error(`Timeline creation failed: ${error.message}`);
  }
}

// Helper: Export table data as CSV
function exportTableData(content, context) {
  try {
    // Try to parse content as table data
    // Simple approach: split by newlines and tabs/spaces
    const lines = content.split('\n').filter(line => line.trim());
    
    // Convert to CSV format
    const csv = lines.map(line => {
      // Replace multiple spaces/tabs with commas
      return line.trim().replace(/\s{2,}|\t+/g, ',');
    }).join('\n');
    
    // Create a data URL
    const blob = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    
    return {
      type: 'text',
      content: `Table data ready to export:\n\n${csv}\n\nTo download: Right-click and "Save link as" on the download button in your browser.`,
      csvData: csv,
      downloadUrl: blob
    };
  } catch (error) {
    console.error('Export error:', error);
    return {
      type: 'text',
      content: 'Could not parse table data. Please select a properly formatted table.'
    };
  }
}

// Helper: Visualize data with AI assistance
async function visualizeData(content) {
  try {
    const client = await getOpenAIClient();
    
    console.log('Analyzing data for visualization');
    
    const response = await client.responses.create({
      model: 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: 'You are a data analyst. Analyze the given tabular data and suggest the best way to visualize it. Describe what type of chart would work best and what insights can be gained.' }]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: `Analyze this data:\n\n${content}` }]
        }
      ]
    });
    
    console.log('Data analysis completed');
    
    return {
      type: 'text',
      content: response.output_text + '\n\nTip: You can copy this data to tools like Google Sheets, Excel, or plot.ly for actual visualization.'
    };
  } catch (error) {
    console.error('Data visualization error:', error);
    throw new Error(`Data analysis failed: ${error.message}`);
  }
}

// Helper: Fetch academic citation
async function fetchCitation(content) {
  try {
    const client = await getOpenAIClient();
    
    console.log('Fetching citation information');
    
    // Check if it's a DOI, arXiv, or citation number
    const doiMatch = content.match(/10\.\d{4,}\/[^\s]+/);
    const arxivMatch = content.match(/arXiv:(\d+\.\d+)/i);
    
    let url = null;
    if (doiMatch) {
      url = `https://doi.org/${doiMatch[0]}`;
    } else if (arxivMatch) {
      url = `https://arxiv.org/abs/${arxivMatch[1]}`;
    }
    
    // Use AI to extract/format citation
    const response = await client.responses.create({
      model: 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: 'You are an academic librarian. Extract and format citation information from the given text. Include authors, title, year, journal/conference, and DOI if available.' }]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: `Extract citation from: ${content}` }]
        }
      ]
    });
    
    console.log('Citation fetched');
    
    let result = {
      type: 'text',
      content: response.output_text
    };
    
    if (url) {
      result.type = 'url';
      result.url = url;
      result.citation = response.output_text;
      result.instruction = 'Click to open the paper. Citation details above.';
    }
    
    return result;
  } catch (error) {
    console.error('Citation fetch error:', error);
    throw new Error(`Citation lookup failed: ${error.message}`);
  }
}

// Helper: Check link safety
async function checkLink(url) {
  try {
    const client = await getOpenAIClient();
    
    console.log('Checking link safety');
    
    // Extract actual URL if in text
    const urlMatch = url.match(/https?:\/\/[^\s]+/);
    const actualUrl = urlMatch ? urlMatch[0] : url;
    
    // Parse URL
    let domain = 'unknown';
    try {
      const urlObj = new URL(actualUrl);
      domain = urlObj.hostname;
    } catch (e) {
      domain = 'Invalid URL';
    }
    
    const response = await client.responses.create({
      model: 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: 'You are a cybersecurity expert. Analyze the given URL and assess its safety. Check the domain, look for suspicious patterns, and provide safety recommendations.' }]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: `Check this URL: ${actualUrl}` }]
        }
      ]
    });
    
    console.log('Link check completed');
    
    return {
      type: 'text',
      content: `Domain: ${domain}\n\n${response.output_text}\n\n⚠️ Always be cautious when clicking unknown links!`
    };
  } catch (error) {
    console.error('Link check error:', error);
    throw new Error(`Link safety check failed: ${error.message}`);
  }
}

// Handle extension icon click - open side panel
chrome.action.onClicked.addListener(async (tab) => {
  console.log('Extension icon clicked, opening side panel...');
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    console.log('✅ Side panel opened from extension icon');
  } catch (error) {
    console.error('❌ Error opening side panel from icon:', error);
  }
});

console.log('Proactive AI Assistant background service worker loaded');

// Ensure clicking the toolbar icon opens the side panel automatically (where supported)
try {
  chrome.sidePanel.setPanelBehavior?.({ openPanelOnActionClick: true });
} catch (e) {
  // Ignore if not supported in current Chrome version
}

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.sidePanel.setPanelBehavior?.({ openPanelOnActionClick: true });
  } catch (e) {
    // Ignore if not supported
  }
});

