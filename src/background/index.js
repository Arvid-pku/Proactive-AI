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

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini', // Using gpt-4o-mini as fastest option (GPT-5 nano not yet in API)
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 100
    });

    const toolIds = JSON.parse(response.choices[0].message.content);
    
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
      pronounce: () => pronounceText(content)
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

// Helper: Graph equation using Desmos
function graphEquation(equation) {
  // Clean equation for Desmos
  const cleaned = equation.replace(/\\|{|}/g, '').trim();
  const desmosUrl = `https://www.desmos.com/calculator`;
  
  return {
    type: 'url',
    url: desmosUrl,
    equation: cleaned,
    instruction: 'Opening Desmos graphing calculator. Enter the equation manually or use the pre-filled version.'
  };
}

// Helper: Explain using AI
async function explainWithAI(content, instruction) {
  try {
    const client = await getOpenAIClient();
    
    console.log('Calling OpenAI API for:', instruction);
    
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful teacher and tutor.' },
        { role: 'user', content: `${instruction}:\n\n${content}` }
      ],
      temperature: 0.7,
      max_tokens: 500
    });
    
    console.log('OpenAI API response received');
    
    return {
      type: 'text',
      content: response.choices[0].message.content
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
    
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a translator. Detect the language and translate to English. If already in English, translate to Spanish.' },
        { role: 'user', content: content }
      ],
      temperature: 0.3,
      max_tokens: 300
    });
    
    console.log('Translation completed');
    
    return {
      type: 'text',
      content: response.choices[0].message.content
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

console.log('Proactive AI Assistant background service worker loaded');

