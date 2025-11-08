/**
 * Content Script
 * Monitors DOM, tracks mouse position, and manages UI injection
 */

import { analyzeContent, getContext, extractText } from '../utils/contentDetectors.js';
import { extractTextFromImage, isImage } from '../utils/ocrHelper.js';

// State
let mousePosition = { x: 0, y: 0 };
let selectedElement = null;
let selectedText = '';
let uiInjected = false;
let currentOCRBadge = null;
let currentContentTypes = [];
let currentMetadata = null;
let currentOCRBadgeTarget = null;
let currentOCRBadgeHandler = null;
let analysisTriggerButton = null;
let analysisTriggerHandler = null;
let pendingAnalysis = null;
let suppressNextClickReset = false;

// Configuration
const MIN_TEXT_LENGTH = 3;
const SUGGESTION_CACHE_TTL = 15000;
let lastSuggestionKey = null;
let lastSuggestionResult = null;
let lastSuggestionTimestamp = 0;
const TRIGGER_SIZE = 20;
const TRIGGER_OFFSET = 12;

// Track mouse position
document.addEventListener('mousemove', (e) => {
  mousePosition = { x: e.clientX, y: e.clientY };
});

// Track text selection
document.addEventListener('mouseup', handleSelection);
document.addEventListener('keyup', handleSelection);

document.addEventListener('click', handleDocumentClick, true);

/**
 * Handle text selection
 */
function handleSelection() {
  const selection = window.getSelection();
  const text = selection.toString().trim();
  
  if (text.length >= MIN_TEXT_LENGTH) {
    suppressNextClickReset = true;
    selectedText = text;
    removeImageBadge();
    
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
    
    if (element.closest && element.closest('#proactive-ai-root')) {
      return;
    }
    
    selectedElement = element;
    
    const triggerPosition = {
      x: Math.min(rect.right + TRIGGER_OFFSET, window.innerWidth - TRIGGER_OFFSET),
      y: Math.min(Math.max(rect.top + rect.height / 2, TRIGGER_OFFSET), window.innerHeight - TRIGGER_OFFSET)
    };
    
    pendingAnalysis = {
      type: 'text',
      text,
      element,
      position: triggerPosition,
      trigger: 'selection'
    };
    
    showAnalysisTrigger(triggerPosition, {
      label: '',
      onActivate: runPendingAnalysis
    });
  } else {
    selectedText = '';
    selectedElement = null;
    pendingAnalysis = null;
    removeAnalysisTrigger();
    hideUI();
  }
}

/**
 * Perform OCR after explicit user request
 */
async function runImageOCR(element, triggerPosition = null) {
  try {
    console.log('Starting OCR for image after user confirmation...');
    
    selectedElement = element;
    pendingAnalysis = null;
    removeAnalysisTrigger();
    
    // Update badge to processing state
    updateImageBadgeState(element, 'processing');
    
    // Show loading indicator
    const loadingMetadata = {
      pageTitle: document.title || '',
      trigger: 'image-ocr',
      language: detectLanguageHint('', { types: ['image'], diagnostics: [] }),
      detectorSummary: ['Image element detected (waiting for OCR confirmation).'],
      sourceUrl: location.href,
      contentLength: 0,
      elementTag: element?.tagName || '',
      timestamp: Date.now(),
      isOCR: true
    };
    
    showUI({
      tools: ['ocr_image'],
      content: 'Analyzing image...',
      position: {
        x: triggerPosition?.x ?? mousePosition.x,
        y: triggerPosition?.y ?? mousePosition.y + 20
      },
      contentTypes: ['image'],
      trigger: 'image-ocr',
      loading: true,
      metadata: loadingMetadata
    });
    
    // Perform OCR
    const ocrResult = await extractTextFromImage(element);
    
    if (ocrResult && ocrResult.text) {
      console.log(`OCR found ${ocrResult.words} words (confidence: ${ocrResult.confidence.toFixed(1)}%)`);
      
      // Update badge to success state
      updateImageBadgeState(element, 'success');
      
      // Analyze the extracted text
      analyzeAndShowTools({
        text: ocrResult.text,
        element,
        position: {
          x: triggerPosition?.x ?? mousePosition.x,
          y: triggerPosition?.y ?? mousePosition.y + 20
        },
        trigger: 'image-ocr',
        isOCR: true,
        ocrConfidence: ocrResult.confidence
      });
    } else {
      console.warn('No text found in image');
      removeImageBadge();
      hideUI();
    }
  } catch (error) {
    console.error('OCR Error:', error);
    // Show error or hide UI
    removeImageBadge();
    hideUI();
  }
}

/**
 * Show OCR badge on image
 */
function showImageBadge(element, clickPosition = null) {
  // Remove existing badge
  removeImageBadge();
  
  // Make sure element has position context
  const computedStyle = window.getComputedStyle(element);
  const currentPosition = computedStyle.position;
  if (currentPosition === 'static') {
    element.style.position = 'relative';
  }
  
  element.classList.add('proactive-ai-ocr-detected');
  
  const badge = document.createElement('button');
  badge.className = 'proactive-ai-ocr-badge';
  badge.title = 'Click to extract text from this image';
  badge.type = 'button';
  badge.textContent = '';
  badge.setAttribute('aria-label', 'Extract text with AI');
  
  const rect = element.getBoundingClientRect();
  const baseLeft = rect.left;
  const baseTop = rect.top;
  const pointerLeft = clickPosition ? clickPosition.x - TRIGGER_SIZE / 2 : baseLeft;
  const pointerTop = clickPosition ? clickPosition.y - TRIGGER_SIZE / 2 : baseTop;
  
  badge.style.position = 'fixed';
  badge.style.top = `${Math.min(Math.max(pointerTop, 4), window.innerHeight - TRIGGER_SIZE - 4)}px`;
  badge.style.left = `${Math.min(Math.max(pointerLeft, 4), window.innerWidth - TRIGGER_SIZE - 4)}px`;
  badge.style.pointerEvents = 'auto';
  badge.style.cursor = 'pointer';
  
  const handler = (event) => {
    event.stopPropagation();
    event.preventDefault();
    runImageOCR(element, { x: event.clientX, y: event.clientY });
  };
  badge.addEventListener('click', handler);
  
  document.body.appendChild(badge);
  currentOCRBadge = badge;
  currentOCRBadgeTarget = element;
  currentOCRBadgeHandler = handler;
  
  console.log('OCR badge added to image');
}

/**
 * Update badge state (processing, success, error)
 */
function updateImageBadgeState(element, state) {
  // Remove old state classes
  element.classList.remove('proactive-ai-ocr-detected', 'proactive-ai-ocr-processing', 'proactive-ai-ocr-success');
  
  // Add new state class
  if (currentOCRBadge && currentOCRBadgeTarget === element) {
    currentOCRBadge.classList.remove('is-processing', 'is-success');
  }
  
  if (state === 'processing') {
    element.classList.add('proactive-ai-ocr-processing');
    if (currentOCRBadge && currentOCRBadgeTarget === element) {
      currentOCRBadge.classList.add('is-processing');
      currentOCRBadge.textContent = '...';
      currentOCRBadge.disabled = true;
    }
  } else if (state === 'success') {
    element.classList.add('proactive-ai-ocr-success');
    if (currentOCRBadge && currentOCRBadgeTarget === element) {
      currentOCRBadge.classList.add('is-success');
      currentOCRBadge.textContent = '✓';
    }
    
    // Auto-remove success state after 2 seconds
    setTimeout(() => {
      if (element.classList.contains('proactive-ai-ocr-success')) {
        element.classList.remove('proactive-ai-ocr-success');
      }
      if (currentOCRBadge && currentOCRBadgeTarget === element) {
        currentOCRBadge.classList.remove('is-processing', 'is-success');
        currentOCRBadge.textContent = 'OCR';
        currentOCRBadge.disabled = false;
      }
    }, 2000);
  } else {
    if (currentOCRBadge && currentOCRBadgeTarget === element) {
      currentOCRBadge.classList.remove('is-processing', 'is-success');
      currentOCRBadge.textContent = 'OCR';
      currentOCRBadge.disabled = false;
    }
  }
}

/**
 * Remove OCR badge
 */
function removeImageBadge() {
  if (currentOCRBadge) {
    if (currentOCRBadgeHandler) {
      currentOCRBadge.removeEventListener('click', currentOCRBadgeHandler);
    }
    currentOCRBadge.remove();
    currentOCRBadge = null;
    currentOCRBadgeHandler = null;
    currentOCRBadgeTarget = null;
  }
  
  // Remove all OCR-related classes from all elements
  document.querySelectorAll('.proactive-ai-ocr-detected, .proactive-ai-ocr-processing, .proactive-ai-ocr-success').forEach(el => {
    el.classList.remove('proactive-ai-ocr-detected', 'proactive-ai-ocr-processing', 'proactive-ai-ocr-success');
  });
}

function showAnalysisTrigger(position, { label = '', onActivate } = {}) {
  removeAnalysisTrigger();
  
  const button = document.createElement('button');
  button.className = 'proactive-ai-trigger';
  button.type = 'button';
  button.title = 'Open AI recommendations';
  button.setAttribute('aria-label', 'Open AI recommendations');
  if (label) {
    button.textContent = label;
  }
  
  const offsetX = Math.min(
    Math.max(position.x - TRIGGER_SIZE / 2, 4),
    window.innerWidth - TRIGGER_SIZE - 4
  );
  const offsetY = Math.min(
    Math.max(position.y - TRIGGER_SIZE / 2, 4),
    window.innerHeight - TRIGGER_SIZE - 4
  );
  
  button.style.position = 'fixed';
  button.style.left = `${offsetX}px`;
  button.style.top = `${offsetY}px`;
  button.style.zIndex = 2147483644;
  
  analysisTriggerHandler = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onActivate?.();
  };
  
  button.addEventListener('click', analysisTriggerHandler);
  document.body.appendChild(button);
  analysisTriggerButton = button;
}

function removeAnalysisTrigger() {
  if (analysisTriggerButton) {
    if (analysisTriggerHandler) {
      analysisTriggerButton.removeEventListener('click', analysisTriggerHandler);
    }
    analysisTriggerButton.remove();
    analysisTriggerButton = null;
    analysisTriggerHandler = null;
  }
}

async function runPendingAnalysis() {
  if (!pendingAnalysis) return;
  
  const data = pendingAnalysis;
  pendingAnalysis = null;
  removeAnalysisTrigger();
  
  if (data.type === 'image') {
    await runImageOCR(data.element, data.position);
    return;
  }
  
  analyzeAndShowTools({
    text: data.text,
    element: data.element,
    position: data.position,
    trigger: data.trigger
  });
}

function handleDocumentClick(event) {
  if (analysisTriggerButton && analysisTriggerButton.contains(event.target)) {
    return;
  }
  if (currentOCRBadge && currentOCRBadge.contains(event.target)) {
    return;
  }
  if (event.target.closest && event.target.closest('#proactive-ai-root')) {
    return;
  }
  
  if (suppressNextClickReset) {
    suppressNextClickReset = false;
    return;
  }
  
  if (isImage(event.target)) {
    event.preventDefault();
    event.stopPropagation();
    selectedText = '';
    selectedElement = event.target;
    pendingAnalysis = {
      type: 'image',
      element: event.target,
      position: {
        x: event.clientX,
        y: event.clientY
      },
      trigger: 'image-click'
    };
    showImageBadge(event.target, { x: event.clientX, y: event.clientY });
    removeAnalysisTrigger();
    hideUI();
    return;
  }
  
  if (analysisTriggerButton) {
    removeAnalysisTrigger();
    pendingAnalysis = null;
  }
}

/**
 * Analyze content and show appropriate tools
 */
async function analyzeAndShowTools({ text, element, position, trigger, isOCR = false, ocrConfidence = null }) {
  try {
    pendingAnalysis = null;
    const analysis = analyzeContent(text, element);
    const contentTypes = analysis.types;
    const context = getContext(element);
    const metadata = buildSelectionMetadata({
      text,
      element,
      analysis,
      trigger,
      context,
      isOCR,
      ocrConfidence
    });
    
    const requestPayload = {
      content: text.slice(0, 500),
      context: context.slice(-1000),
      contentTypes,
      metadata
    };
    
    const cacheKey = JSON.stringify({
      content: requestPayload.content,
      context: requestPayload.context,
      types: contentTypes
    });
    
    let response = null;
    const now = Date.now();
    if (cacheKey === lastSuggestionKey && now - lastSuggestionTimestamp < SUGGESTION_CACHE_TTL && lastSuggestionResult) {
      response = { ...lastSuggestionResult, cached: true };
    } else {
      response = await chrome.runtime.sendMessage({
        action: 'GET_TOOL_SUGGESTIONS',
        data: requestPayload
      });
      
      if (response && response.success) {
        lastSuggestionKey = cacheKey;
        lastSuggestionResult = response;
        lastSuggestionTimestamp = now;
      }
    }
    
    if (response && response.success) {
      showUI({
        tools: response.tools,
        content: text,
        position,
        contentTypes,
        trigger,
        metadata,
        isOCR,
        ocrConfidence
      });
    }
    
  } catch (error) {
    if (error.message && error.message.includes('Extension context invalidated')) {
      console.warn('Extension was reloaded. Please refresh this page to use the assistant.');
      // Show a user-friendly message
      alert('Proactive AI Assistant was updated. Please refresh this page (F5) to continue using it.');
    } else {
      console.error('Error analyzing content:', error);
    }
  }
}

/**
 * Show UI with tools
 */
function showUI({
  tools,
  content,
  position,
  contentTypes,
  trigger,
  loading = false,
  isOCR = false,
  ocrConfidence = null,
  metadata = null
}) {
  if (Array.isArray(contentTypes)) {
    currentContentTypes = contentTypes;
  }
  if (metadata) {
    currentMetadata = metadata;
  }
  
  // Send message to injected UI
  window.postMessage({
    type: 'PROACTIVE_AI_SHOW',
    payload: {
      tools,
      content: content.slice(0, 200), // Preview only
      fullContent: content,
      position,
      contentTypes,
      trigger,
      loading,
      isOCR,
      ocrConfidence,
      metadata: metadata || currentMetadata
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
  removeAnalysisTrigger();
}

function buildSelectionMetadata({ text, element, analysis, trigger, context, isOCR, ocrConfidence }) {
  const language = detectLanguageHint(text, analysis);
  const metadata = {
    pageTitle: document.title || '',
    language,
    detectorSummary: analysis.diagnostics,
    trigger,
    sourceUrl: location.href,
    contentLength: text.length,
    elementTag: element?.tagName || '',
    timestamp: Date.now(),
    contextSnippet: context.slice(-300)
  };
  
  if (isOCR) {
    metadata.isOCR = true;
    if (ocrConfidence !== null && ocrConfidence !== undefined) {
      metadata.ocrConfidence = Number(ocrConfidence.toFixed(2));
    }
  }
  
  const elementLang = element?.getAttribute?.('lang');
  if (elementLang) {
    metadata.elementLanguage = elementLang;
  }
  
  return metadata;
}

function detectLanguageHint(text, analysis) {
  const docLang = document.documentElement?.lang;
  const navigatorLang = navigator.language;
  let hint = docLang || navigatorLang || '';
  
  if (analysis.types.includes('foreign')) {
    const nonLatinHint = containsNonLatin(text) ? 'non-Latin characters detected' : 'foreign language detected';
    hint = hint ? `${hint}; ${nonLatinHint}` : nonLatinHint;
  }
  
  return hint || 'unknown';
}

function containsNonLatin(text) {
  return /[^\u0000-\u007f]/.test(text);
}

/**
 * Inject React UI into page
 */
function injectUI() {
  if (uiInjected) return;
  
  // Create container for floating assistant
  const container = document.createElement('div');
  container.id = 'proactive-ai-root';
  document.body.appendChild(container);
  
  // Inject UI script
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('ui.js');
  document.head.appendChild(script);
  
  // Create floating action button (FAB)
  const fab = document.createElement('button');
  fab.id = 'proactive-ai-fab';
  fab.innerHTML = 'AI';
  fab.title = 'Open AI Assistant Panel';
  fab.addEventListener('click', async () => {
    console.log('FAB clicked, opening side panel...');
    try {
      const response = await chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' });
      if (response && response.success) {
        console.log('Side panel opened from FAB');
      }
    } catch (error) {
      console.error('Error opening panel from FAB:', error);
    }
  });
  document.body.appendChild(fab);
  
  uiInjected = true;
}

/**
 * Check if element should be skipped
 */
function shouldSkipElement(element) {
  if (!element || !element.tagName) return true;
  
  const skipTags = ['SCRIPT', 'STYLE', 'IFRAME', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
  const skipClasses = ['proactive-ai', 'proactive-ai-root', 'proactive-ai-trigger'];
  
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
    const { toolId, content, metadata: providedMetadata, contentTypes: providedTypes } = event.data.payload;
    
    if (Array.isArray(providedTypes)) {
      currentContentTypes = providedTypes;
    }
    if (providedMetadata) {
      currentMetadata = providedMetadata;
    }
    
    try {
      // Special handling for graph_equation - execute first, then open panel
      if (toolId === 'graph_equation') {
        console.log('Graphing equation...');

        // Immediately request side panel open to preserve user gesture
        chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' }).catch(() => {});

        // Then execute the tool (parse and save equation)
        const executionContext = selectedElement ? getContext(selectedElement) : '';
        const metadata = currentMetadata
          ? { ...currentMetadata, contextSnippet: executionContext.slice(-300) }
          : null;
        const response = await chrome.runtime.sendMessage({
          action: 'EXECUTE_TOOL',
          data: {
            toolId,
            content,
            context: executionContext,
            contentTypes: currentContentTypes,
            metadata
          }
        });
        
        // Send result back to UI
        window.postMessage({
          type: 'PROACTIVE_AI_TOOL_RESULT',
          payload: response
        }, '*');

        return;
      }
      
      // Normal tool execution for other tools
      const executionContext = selectedElement ? getContext(selectedElement) : '';
      const metadata = currentMetadata
        ? { ...currentMetadata, contextSnippet: executionContext.slice(-300) }
        : null;
      const response = await chrome.runtime.sendMessage({
        action: 'EXECUTE_TOOL',
        data: {
          toolId,
          content,
          context: executionContext,
          contentTypes: currentContentTypes,
          metadata
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
