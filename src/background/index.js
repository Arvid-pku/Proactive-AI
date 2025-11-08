/**
 * Background Service Worker
 * Handles API calls to OpenAI and manages extension state
 */

import OpenAI from 'openai';

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
        const openForWindow = async (windowId) => {
          try {
            await chrome.sidePanel.open({ windowId });
            console.log('✅ Side panel opened successfully');
            sendResponse({ success: true });
          } catch (error) {
            console.error('❌ Error opening side panel:', error);
            sendResponse({ success: false, error: error.message });
          }
        };
        
        const senderTab = sender?.tab;
        if (senderTab?.id && senderTab?.windowId) {
          // Ensure the side panel is enabled and path is set for this tab
          await chrome.sidePanel.setOptions({
            tabId: senderTab.id,
            path: 'sidepanel.html',
            enabled: true
          }).catch(() => { /* best-effort */ });
          
          await openForWindow(senderTab.windowId);
        } else {
          // Fallback to the last focused window
          const win = await chrome.windows.getLastFocused();
          await openForWindow(win.id);
        }
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

// Helper: Graph equation using Desmos (opens side panel)
async function graphEquation(equation) {
  try {
    const client = await getOpenAIClient();
    
    console.log('Parsing equation for Desmos:', equation);
    
    // Use AI to convert equation to Desmos-compatible format
    const response = await client.responses.create({
      model: 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content: [{
            type: 'input_text',
            text: `You are a math equation parser. Convert the given equation to Desmos calculator format.
Rules:
- Use y= for functions (e.g., "y=x^2")
- Use x^2 for powers (not x²)
- Keep simple format
- If multiple equations, separate with semicolons
- Return ONLY the equation(s), no explanation
Examples:
Input: "f(x) = x² + 2x + 1" → Output: "y=x^2+2x+1"
Input: "y = sin(x)" → Output: "y=sin(x)"
Input: "x² + y² = 25" → Output: "x^2+y^2=25"`
          }]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: `Convert to Desmos format: ${equation}` }]
        }
      ]
    });
    
    const desmosEquation = response.output_text.trim();
    console.log('Desmos equation:', desmosEquation);
    
    // Store equation in chrome.storage so side panel can read it
    await chrome.storage.local.set({
      pendingGraph: {
        equation: desmosEquation,
        originalEquation: equation,
        timestamp: Date.now()
      }
    });
    
    console.log('✅ Equation saved to storage for side panel');
    
    // Try to send to side panel if it's open (will fail if not, but that's OK)
    setTimeout(() => {
      chrome.runtime.sendMessage({
        action: 'GRAPH_EQUATION',
        equation: desmosEquation,
        originalEquation: equation
      }).catch(error => {
        console.log('Side panel not open yet, equation stored for when it opens');
      });
    }, 100);
    
    return {
      type: 'success',
      message: '📊 Equation ready! Click the ✨ icon or extension icon to view the graph.',
      equation: desmosEquation,
      originalEquation: equation
    };
  } catch (error) {
    console.error('Equation parsing error:', error);
    // Fallback: simple cleaning
    const cleaned = equation.replace(/\\|{|}/g, '').trim();
    const desmosEquation = cleaned.includes('=') ? cleaned : `y=${cleaned}`;
    
    // Store in storage
    await chrome.storage.local.set({
      pendingGraph: {
        equation: desmosEquation,
        originalEquation: equation,
        timestamp: Date.now()
      }
    });
    
    console.log('✅ Equation saved (fallback)');
    
    return {
      type: 'success',
      message: '📊 Equation ready! Click the ✨ icon or extension icon to view the graph.',
      equation: desmosEquation
    };
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

