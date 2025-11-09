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
let uiReady = false;
let uiFrame = null;
const uiMessageQueue = [];
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

function computeUpperRightPosition(rect) {
  const centerX = Math.min(
    rect.right + TRIGGER_OFFSET,
    window.innerWidth - TRIGGER_SIZE / 2 - 4
  );
  const centerY = Math.max(rect.top - TRIGGER_OFFSET, TRIGGER_OFFSET);
  const clampedY = Math.min(
    centerY,
    window.innerHeight - TRIGGER_SIZE / 2 - 4
  );
  return {
    x: centerX,
    y: clampedY
  };
}

// Track mouse position
document.addEventListener('mousemove', (e) => {
  mousePosition = { x: e.clientX, y: e.clientY };
});

// Track text selection with debounce
let selectionTimeout = null;
document.addEventListener('mouseup', () => {
  clearTimeout(selectionTimeout);
  selectionTimeout = setTimeout(handleSelection, 100);
});
document.addEventListener('keyup', () => {
  clearTimeout(selectionTimeout);
  selectionTimeout = setTimeout(handleSelection, 100);
});

document.addEventListener('click', handleDocumentClick, true);

// Listen for UI readiness from injected page script
window.addEventListener('message', (event) => {
  try {
    if (event.data && event.data.type === 'PROACTIVE_AI_UI_READY') {
      console.log('🎉 UI READY signal received!');
      uiReady = true;
      console.log('Message queue length:', uiMessageQueue.length);
      // Flush any queued UI messages
      while (uiMessageQueue.length) {
        const msg = uiMessageQueue.shift();
        console.log('Flushing queued message:', msg.type);
        try {
          if (uiFrame && uiFrame.contentWindow) {
            uiFrame.style.pointerEvents = 'auto';
            uiFrame.contentWindow.postMessage(msg, '*');
          } else {
            window.postMessage(msg, '*');
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
});

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
    
    const triggerPosition = computeUpperRightPosition(rect);
    
    const target = {
      type: 'text',
      text,
      element,
      position: triggerPosition,
      trigger: 'selection',
      isOCR: false,
      ocrConfidence: null,
      showRequested: false,
      loading: false,
      tools: null,
      promise: null
    };
    
    target.promise = preparePendingAnalysis(target);
    pendingAnalysis = target;

    showAnalysisTrigger(triggerPosition, {
      label: '',
      onActivate: () => runPendingAnalysis(target)
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
    
    const rect = element.getBoundingClientRect();
    const anchorPosition = computeUpperRightPosition(rect);
    
    showUI({
      tools: ['ocr_image'],
      content: 'Analyzing image...',
      position: anchorPosition,
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
      
      const analysisPosition = anchorPosition;
      const target = {
        type: 'text',
        text: ocrResult.text,
        element,
        position: analysisPosition,
        trigger: 'image-ocr',
        isOCR: true,
        ocrConfidence: ocrResult.confidence,
        showRequested: true,
        loading: true,
        tools: null,
        promise: null
      };
      
      target.promise = preparePendingAnalysis(target);
      pendingAnalysis = target;
      
      target.promise.then(() => {
        if (pendingAnalysis === target && target.showRequested) {
          showPreparedAnalysis(target);
        }
      }).catch((error) => {
        console.error('OCR follow-up analysis failed:', error);
        if (pendingAnalysis === target && target.showRequested) {
          showPreparedAnalysis(target);
        }
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
  const anchor = computeUpperRightPosition(rect);
  const centerX = clickPosition?.x ?? anchor.x;
  const centerY = clickPosition?.y ?? anchor.y;
  const left = Math.min(
    Math.max(centerX - TRIGGER_SIZE / 2, 4),
    window.innerWidth - TRIGGER_SIZE - 4
  );
  const top = Math.min(
    Math.max(centerY - TRIGGER_SIZE / 2, 4),
    window.innerHeight - TRIGGER_SIZE - 4
  );
  
  badge.style.position = 'fixed';
  badge.style.top = `${top}px`;
  badge.style.left = `${left}px`;
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
  // Don't recreate if button already exists at same position
  if (analysisTriggerButton) {
    console.log('Trigger button already exists, skipping recreation');
    return;
  }
  
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
    console.log('🔘 Trigger button clicked! Calling onActivate...');
    onActivate?.();
  };
  
  button.addEventListener('click', analysisTriggerHandler);
  document.body.appendChild(button);
  analysisTriggerButton = button;
  
  console.log('✨ Trigger button shown at', position);
  console.log('Button element:', button);
  console.log('Button in DOM:', document.body.contains(button));
  console.log('Button styles:', {
    position: button.style.position,
    left: button.style.left,
    top: button.style.top,
    zIndex: button.style.zIndex,
    display: window.getComputedStyle(button).display,
    visibility: window.getComputedStyle(button).visibility,
    opacity: window.getComputedStyle(button).opacity
  });
}

function removeAnalysisTrigger() {
  if (analysisTriggerButton) {
    console.log('🗑️ Removing trigger button');
    if (analysisTriggerHandler) {
      analysisTriggerButton.removeEventListener('click', analysisTriggerHandler);
    }
    analysisTriggerButton.remove();
    analysisTriggerButton = null;
    analysisTriggerHandler = null;
  }
}

async function runPendingAnalysis(target = pendingAnalysis) {
  console.log('🚀 runPendingAnalysis START');
  console.log('  Target exists:', !!target);
  console.log('  Target type:', target?.type);
  console.log('  Target text:', target?.text?.substring(0, 30));
  
  if (!target) {
    console.warn('❌ No target!');
    return;
  }
  
  removeAnalysisTrigger();
  
  if (target.type === 'image') {
    console.log('Image type - running OCR');
    await runImageOCR(target.element, target.position);
    return;
  }
  
  target.showRequested = true;
  pendingAnalysis = target;
  
  console.log('  showRequested:', target.showRequested);
  console.log('  loading:', target.loading);
  console.log('  promise exists:', !!target.promise);
  
  if (!target.promise) {
    console.log('📝 Creating analysis promise...');
    target.promise = preparePendingAnalysis(target);
  }
  
  if (target.loading) {
    console.log('⏳ Target is loading, showing loading state...');
    showLoadingState(target);
    try {
      await target.promise;
      console.log('✅ Promise resolved');
    } catch (error) {
      console.error('Analysis preparation failed:', error);
    }
    if (pendingAnalysis !== target) {
      console.warn('Target changed during wait');
      return;
    }
    console.log('📊 Calling showPreparedAnalysis (loading path)...');
    showPreparedAnalysis(target);
    return;
  }
  
  try {
    console.log('⏳ Awaiting promise (non-loading)...');
    await target.promise;
    console.log('✅ Promise complete');
  } catch (error) {
    console.error('Analysis preparation failed:', error);
  }
  
  if (pendingAnalysis !== target) {
    console.warn('Target changed!');
    return;
  }
  
  console.log('📊 Calling showPreparedAnalysis (final)...');
  showPreparedAnalysis(target);
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
    const rect = event.target.getBoundingClientRect();
    const triggerPosition = computeUpperRightPosition(rect);
    pendingAnalysis = {
      type: 'image',
      element: event.target,
      position: triggerPosition,
      trigger: 'image-click'
    };
    showImageBadge(event.target);
    removeAnalysisTrigger();
    hideUI();
    return;
  }
  
  if (analysisTriggerButton) {
    removeAnalysisTrigger();
    pendingAnalysis = null;
  }
}

const FALLBACK_TOOLS = {
  math: ['graph_equation', 'explain_math'],
  code: ['explain_code', 'debug_code'],
  text: ['summarize', 'explain_text'],
  foreign: ['translate', 'pronounce'],
  chemical: ['visualize_chemical'],
  table: ['export_table', 'visualize_data'],
  citation: ['fetch_citation', 'summarize'],
  url: ['check_link', 'summarize'],
  image: ['ocr_image', 'summarize']
};

function computeFallbackTools(contentTypes = []) {
  const tools = contentTypes
    .flatMap(type => FALLBACK_TOOLS[type] || [])
    .slice(0, 4);
  return tools.length ? tools : ['save_note', 'summarize'];
}

function showLoadingState(target) {
  const loadingTools =
    (Array.isArray(target.tools) && target.tools.length > 0)
      ? target.tools
      : computeFallbackTools(target.contentTypes || []);
      
  showUI({
    tools: loadingTools,
    content: target.text,
    position: target.position,
    contentTypes: target.contentTypes || [],
    trigger: target.trigger,
    loading: true,
    metadata: target.metadata,
    isOCR: target.isOCR,
    ocrConfidence: target.ocrConfidence
  });
}

function showPreparedAnalysis(target) {
  const preparedTools =
    (Array.isArray(target.tools) && target.tools.length > 0)
      ? target.tools
      : computeFallbackTools(target.contentTypes || []);
  
  showUI({
    tools: preparedTools,
    content: target.text,
    position: target.position,
    contentTypes: target.contentTypes || [],
    trigger: target.trigger,
    metadata: target.metadata,
    isOCR: target.isOCR,
    ocrConfidence: target.ocrConfidence
  });
}

async function preparePendingAnalysis(target) {
  if (!target || !target.element) return;
  
  const analysis = analyzeContent(target.text, target.element);
  const contentTypes = analysis.types;
  const context = getContext(target.element);
  const metadata = buildSelectionMetadata({
    text: target.text,
    element: target.element,
    analysis,
    trigger: target.trigger,
    context,
    isOCR: target.isOCR,
    ocrConfidence: target.ocrConfidence
  });
  
  target.analysis = analysis;
  target.contentTypes = contentTypes;
  target.context = context;
  target.metadata = metadata;
  target.loading = true;
  const requestId = Date.now();
  target.requestId = requestId;
  
  const requestPayload = {
    content: target.text.slice(0, 500),
    context: context.slice(-1000),
    contentTypes,
    metadata
  };
  
  const cacheKey = JSON.stringify({
    content: requestPayload.content,
    context: requestPayload.context,
    types: contentTypes
  });
  
  const now = Date.now();
  let response = null;
  
  if (cacheKey === lastSuggestionKey && now - lastSuggestionTimestamp < SUGGESTION_CACHE_TTL && lastSuggestionResult) {
    response = {
      ...lastSuggestionResult,
      tools: Array.isArray(lastSuggestionResult.tools) ? [...lastSuggestionResult.tools] : [],
      cached: true
    };
  } else {
    try {
      response = await chrome.runtime.sendMessage({
        action: 'GET_TOOL_SUGGESTIONS',
        data: requestPayload
      });
      if (response && response.success) {
        lastSuggestionKey = cacheKey;
        lastSuggestionResult = response;
        lastSuggestionTimestamp = now;
      }
    } catch (error) {
      if (error?.message?.includes('Extension context invalidated')) {
        console.warn('Extension was reloaded. Request aborted.');
        alert('Proactive AI Assistant was updated. Please refresh this page (F5) to continue using it.');
      } else {
        console.error('Error requesting tool suggestions:', error);
      }
      response = null;
    }
  }
  
  if (pendingAnalysis !== target || target.requestId !== requestId) {
    return;
  }
  
  target.loading = false;
  
  if (response && response.success && Array.isArray(response.tools)) {
    target.tools = response.tools.slice(0, 4);
    target.response = response;
  } else if (response && Array.isArray(response.tools)) {
    target.tools = response.tools.slice(0, 4);
    target.response = response;
  } else {
    target.tools = computeFallbackTools(contentTypes);
    target.response = { success: false, fallback: true, tools: target.tools };
  }
  
  if (!target.tools || target.tools.length === 0) {
    target.tools = computeFallbackTools(contentTypes);
  }

  return target;
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
  // Ensure UI is injected before attempting to show
  if (!uiInjected) {
    injectUI();
  }

  if (Array.isArray(contentTypes)) {
    currentContentTypes = contentTypes;
  }
  if (metadata) {
    currentMetadata = metadata;
  }

  const message = {
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
  };

  // If UI hasn't finished initializing yet, queue the message
  if (!uiReady) {
    uiMessageQueue.push(message);
  }
  // Also attempt to post immediately in case UI is already ready
  try {
    const containerEl = document.getElementById('proactive-ai-root');
    if (containerEl) {
      containerEl.style.pointerEvents = 'auto';
    }
    if (uiFrame && uiFrame.contentWindow) {
      // Enable interactions while UI is visible
      uiFrame.style.pointerEvents = 'auto';
      uiFrame.contentWindow.postMessage(message, '*');
    } else {
      window.postMessage(message, '*');
    }
  } catch (_) {}
  
  // Inject UI if not already injected
  // (already ensured above)
}

/**
 * Hide UI
 */
function hideUI() {
  const msg = { type: 'PROACTIVE_AI_HIDE' };
  try {
    if (uiFrame && uiFrame.contentWindow) {
      uiFrame.contentWindow.postMessage(msg, '*');
      // Disable interactions when hidden so page remains usable
      uiFrame.style.pointerEvents = 'none';
    } else {
      window.postMessage(msg, '*');
    }
    const containerEl = document.getElementById('proactive-ai-root');
    if (containerEl) {
      containerEl.style.pointerEvents = 'none';
    }
  } catch (_) {}
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
  
  // Prefer iframe-based injection to avoid CSP issues
  try {
    const frame = document.createElement('iframe');
    frame.id = 'proactive-ai-frame';
    frame.src = chrome.runtime.getURL('ui.html');
    frame.style.position = 'fixed';
    frame.style.left = '0';
    frame.style.top = '0';
    frame.style.width = '100%';
    frame.style.height = '100%';
    frame.style.border = '0';
    frame.style.background = 'transparent';
    frame.style.zIndex = '2147483646';
    // Start non-interactive; enable on show
    frame.style.pointerEvents = 'none';
    container.appendChild(frame);
    uiFrame = frame;
    
    console.log('✅ UI iframe created');
    
    // Fallback: Force UI ready after 2 seconds if not ready
    setTimeout(() => {
      if (!uiReady) {
        console.warn('⚠️ UI not ready after 2s, forcing ready state');
        uiReady = true;
        // Flush any queued messages
        while (uiMessageQueue.length > 0) {
          const msg = uiMessageQueue.shift();
          try {
            if (uiFrame && uiFrame.contentWindow) {
              uiFrame.contentWindow.postMessage(msg, '*');
            }
          } catch (e) {
            console.error('Error flushing queued message:', e);
          }
        }
      }
    }, 2000);
  } catch (e) {
    console.error('Error creating iframe, falling back to direct script:', e);
    // Fallback to direct script injection (may be blocked by CSP)
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('ui.js');
    script.onload = () => {
      console.log('✅ UI script loaded (fallback)');
      setTimeout(() => {
        uiReady = true;
      }, 500);
    };
    document.head.appendChild(script);
  }
  
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
        try {
          const msg = { type: 'PROACTIVE_AI_TOOL_RESULT', payload: response };
          if (uiFrame && uiFrame.contentWindow) {
            uiFrame.contentWindow.postMessage(msg, '*');
          } else {
            window.postMessage(msg, '*');
          }
        } catch (_) {}

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
      try {
        const msg = { type: 'PROACTIVE_AI_TOOL_RESULT', payload: response };
        if (uiFrame && uiFrame.contentWindow) {
          uiFrame.contentWindow.postMessage(msg, '*');
        } else {
          window.postMessage(msg, '*');
        }
      } catch (_) {}
      
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

// Ensure UI is injected on page load so FAB and iframe are available
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    try {
      injectUI();
    } catch (e) {
      // ignore
    }
  });
} else {
  try {
    injectUI();
  } catch (e) {
    // ignore
  }
}