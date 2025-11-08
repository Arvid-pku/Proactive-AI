/**
 * Content Script
 * Monitors DOM, tracks mouse position, and manages UI injection
 */

import { analyzeContent, getContext, extractText } from '../utils/contentDetectors.js';

// State
let mousePosition = { x: 0, y: 0 };
let selectedElement = null;
let selectedText = '';
let debounceTimer = null;
let uiInjected = false;

// Configuration
const DEBOUNCE_DELAY = 800; // ms to wait before showing UI
const MIN_TEXT_LENGTH = 3;

// Track mouse position
document.addEventListener('mousemove', (e) => {
  mousePosition = { x: e.clientX, y: e.clientY };
});

// Track text selection
document.addEventListener('mouseup', handleSelection);
document.addEventListener('keyup', handleSelection);

// Track hover with debounce
document.addEventListener('mouseover', (e) => {
  clearTimeout(debounceTimer);
  
  debounceTimer = setTimeout(() => {
    handleHover(e.target);
  }, DEBOUNCE_DELAY);
});

document.addEventListener('mouseout', () => {
  clearTimeout(debounceTimer);
});

/**
 * Handle text selection
 */
function handleSelection() {
  const selection = window.getSelection();
  const text = selection.toString().trim();
  
  if (text.length >= MIN_TEXT_LENGTH) {
    selectedText = text;
    
    // Safety check for selection
    if (!selection.anchorNode) {
      console.warn('No anchor node in selection');
      return;
    }
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Get the element - handle both element and text nodes
    let element = selection.anchorNode;
    if (element.nodeType === Node.TEXT_NODE) {
      element = element.parentElement;
    }
    
    if (!element) {
      console.warn('Could not find parent element');
      return;
    }
    
    selectedElement = element;
    
    analyzeAndShowTools({
      text,
      element,
      position: {
        x: rect.left + rect.width / 2,
        y: rect.bottom + 10
      },
      trigger: 'selection'
    });
  } else {
    hideUI();
  }
}

/**
 * Handle hover over element
 */
function handleHover(element) {
  // Skip if text is selected
  if (selectedText) return;
  
  // Skip UI elements, buttons, etc.
  if (shouldSkipElement(element)) return;
  
  const text = extractText(element);
  
  if (text.length >= MIN_TEXT_LENGTH && text.length < 2000) {
    selectedElement = element;
    
    analyzeAndShowTools({
      text,
      element,
      position: {
        x: mousePosition.x,
        y: mousePosition.y + 20
      },
      trigger: 'hover'
    });
  }
}

/**
 * Analyze content and show appropriate tools
 */
async function analyzeAndShowTools({ text, element, position, trigger }) {
  try {
    // Detect content types
    const contentTypes = analyzeContent(text, element);
    const context = getContext(element);
    
    // Get AI suggestions for tools
    const response = await chrome.runtime.sendMessage({
      action: 'GET_TOOL_SUGGESTIONS',
      data: {
        content: text.slice(0, 500), // Limit text size
        context: context,
        contentTypes
      }
    });
    
    if (response.success) {
      showUI({
        tools: response.tools,
        content: text,
        position,
        contentTypes,
        trigger
      });
    }
    
  } catch (error) {
    console.error('Error analyzing content:', error);
  }
}

/**
 * Show UI with tools
 */
function showUI({ tools, content, position, contentTypes, trigger }) {
  // Send message to injected UI
  window.postMessage({
    type: 'PROACTIVE_AI_SHOW',
    payload: {
      tools,
      content: content.slice(0, 200), // Preview only
      fullContent: content,
      position,
      contentTypes,
      trigger
    }
  }, '*');
  
  // Inject UI if not already injected
  if (!uiInjected) {
    injectUI();
  }
}

/**
 * Hide UI
 */
function hideUI() {
  window.postMessage({
    type: 'PROACTIVE_AI_HIDE'
  }, '*');
}

/**
 * Inject React UI into page
 */
function injectUI() {
  if (uiInjected) return;
  
  // Create container
  const container = document.createElement('div');
  container.id = 'proactive-ai-root';
  document.body.appendChild(container);
  
  // Inject UI script
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('ui.js');
  document.head.appendChild(script);
  
  uiInjected = true;
}

/**
 * Check if element should be skipped
 */
function shouldSkipElement(element) {
  if (!element || !element.tagName) return true;
  
  const skipTags = ['SCRIPT', 'STYLE', 'IFRAME', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
  const skipClasses = ['proactive-ai', 'proactive-ai-root'];
  
  if (skipTags.includes(element.tagName)) return true;
  if (skipClasses.some(cls => element.classList?.contains(cls))) return true;
  if (element.id === 'proactive-ai-root') return true;
  
  return false;
}

/**
 * Listen for tool execution requests from UI
 */
window.addEventListener('message', async (event) => {
  if (event.data.type === 'PROACTIVE_AI_EXECUTE_TOOL') {
    const { toolId, content } = event.data.payload;
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'EXECUTE_TOOL',
        data: {
          toolId,
          content,
          context: selectedElement ? getContext(selectedElement) : ''
        }
      });
      
      // Send result back to UI
      window.postMessage({
        type: 'PROACTIVE_AI_TOOL_RESULT',
        payload: response
      }, '*');
      
      // Handle specific result types
      if (response && response.success && response.result) {
        handleToolResult(response.result, toolId);
      }
    } catch (error) {
      console.error('Error executing tool:', error);
      // Send error back to UI
      window.postMessage({
        type: 'PROACTIVE_AI_TOOL_RESULT',
        payload: {
          success: false,
          error: error.message || 'Failed to execute tool'
        }
      }, '*');
    }
  }
});

/**
 * Handle tool execution results
 */
function handleToolResult(result, toolId) {
  if (result.type === 'url') {
    // Open URL in new tab
    window.open(result.url, '_blank');
  } else if (result.type === 'audio') {
    // Use Web Speech API
    const utterance = new SpeechSynthesisUtterance(result.text);
    speechSynthesis.speak(utterance);
  }
  // Text results are handled by UI
}

console.log('Proactive AI Assistant content script loaded');

