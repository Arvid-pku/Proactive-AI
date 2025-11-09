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
            // Don't set pointer-events on iframe - keep it transparent
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
    // Don't interrupt OCR if it's processing
    if (pendingAnalysis && pendingAnalysis.isProcessing) {
      console.log('OCR is processing, ignoring text selection');
      return;
    }
    
    // Cancel any pending badge removal
    if (badgeRemovalTimeout) {
      clearTimeout(badgeRemovalTimeout);
      badgeRemovalTimeout = null;
    }
    
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
    // Only clear if OCR is not processing
    if (pendingAnalysis && pendingAnalysis.isProcessing) {
      console.log('⛔ OCR is processing, not clearing on empty selection');
      return;
    }
    
    selectedText = '';
    selectedElement = null;
    pendingAnalysis = null;
    removeAnalysisTrigger();
    // Don't auto-hide UI - let user explicitly close it
    // hideUI();
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
    
    const rect = element.getBoundingClientRect();
    const anchorPosition = computeUpperRightPosition(rect);
    
    // Create target BEFORE OCR with placeholder text
    const target = {
      type: 'text',
      text: 'Analyzing image...',  // Placeholder
      element,
      position: anchorPosition,
      trigger: 'image-ocr',
      isOCR: true,
      ocrConfidence: null,
      showRequested: true,
      loading: true,
      tools: ['ocr_image'],  // Default tool while loading
      promise: null,
      contentTypes: ['image'],
      isProcessing: true  // Flag to prevent clicks from hiding UI
    };
    
    pendingAnalysis = target;
    
    // Show loading UI immediately
    showLoadingState(target);
    
    console.log('🔄 OCR: Loading UI shown, starting OCR...');
    
    // Perform OCR
    const ocrResult = await extractTextFromImage(element);
    
    console.log('🔄 OCR: OCR completed, result:', ocrResult ? 'success' : 'failed');
    
    if (ocrResult && ocrResult.text) {
      console.log(`OCR found ${ocrResult.words} words (confidence: ${ocrResult.confidence.toFixed(1)}%)`);
      
      // Keep badge in processing state - don't mark as success yet
      // It will turn green after UI is fully shown
      
      // Update target with OCR result
      target.text = ocrResult.text;
      target.ocrConfidence = ocrResult.confidence;
      // Don't set loading to false here - preparePendingAnalysis will manage it
      
      console.log('🔄 OCR: Preparing analysis...');
      
      // Now prepare analysis with the actual text
      target.promise = preparePendingAnalysis(target);
      
      // Wait for analysis to complete, then show result
      await target.promise;
      
      console.log('🔄 OCR: Analysis complete');
      console.log('  pendingAnalysis === target?', pendingAnalysis === target);
      console.log('  target.loading:', target.loading);
      console.log('  target.tools:', target.tools);
      
      if (pendingAnalysis === target) {
        console.log('🔄 OCR: Showing prepared analysis...');
        showPreparedAnalysis(target);
        console.log('🔄 OCR: showPreparedAnalysis returned');
        
        // NOW mark badge as success - UI is shown
        updateImageBadgeState(element, 'success');
        
        // CRITICAL: Keep isProcessing=true for a moment to prevent immediate hiding
        // UI needs time to render and stabilize before we allow clicks to affect it
        setTimeout(() => {
          console.log('🔄 OCR: Clearing isProcessing flag after UI stabilized');
          if (target) {
            target.isProcessing = false;
          }
        }, 300);
        
        // Add a small delay to check if UI is still visible
        setTimeout(() => {
          console.log('🔄 OCR: Checking UI visibility after 100ms');
          if (uiFrame) {
            console.log('  iframe display:', uiFrame.style.display);
          }
        }, 100);
      } else {
        console.warn('🔄 OCR: pendingAnalysis changed, not showing UI');
      }
    } else {
      console.warn('No text found in image');
      removeImageBadge();
      // Don't auto-hide - user can manually dismiss
      // hideUI();
    }
  } catch (error) {
    console.error('OCR Error:', error);
    removeImageBadge();
    // Don't auto-hide on error - user can manually dismiss
    // hideUI();
  } finally {
    // Always clear isProcessing flag when OCR completes or fails
    if (pendingAnalysis && pendingAnalysis.isProcessing) {
      setTimeout(() => {
        if (pendingAnalysis) {
          pendingAnalysis.isProcessing = false;
        }
      }, 500);
    }
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
  badge.textContent = ''; // Empty like the text trigger button
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
    
    // Cancel any removal timeout when clicking badge
    if (badgeRemovalTimeout) {
      clearTimeout(badgeRemovalTimeout);
      badgeRemovalTimeout = null;
    }
    
    // Cancel hover timeout
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    
    runImageOCR(element, { x: event.clientX, y: event.clientY });
  };
  badge.addEventListener('click', handler);
  
  // Also cancel removal timeout when hovering over badge
  badge.addEventListener('mouseenter', () => {
    // Cancel ALL timeouts when hovering badge
    if (badgeRemovalTimeout) {
      clearTimeout(badgeRemovalTimeout);
      badgeRemovalTimeout = null;
    }
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
  });
  
  // When mouse leaves badge, start removal timer
  badge.addEventListener('mouseleave', (e) => {
    const relatedTarget = e.relatedTarget;
    // If not going back to the image, schedule removal
    if (relatedTarget && relatedTarget !== element && !element.contains(relatedTarget)) {
      if (badgeRemovalTimeout) {
        clearTimeout(badgeRemovalTimeout);
      }
      badgeRemovalTimeout = setTimeout(() => {
        if (currentOCRBadge === badge && (!pendingAnalysis || !pendingAnalysis.isProcessing)) {
          removeImageBadge();
        }
        badgeRemovalTimeout = null;
      }, 2000);
    }
  });
  
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
      currentOCRBadge.textContent = ''; // Keep empty during processing
      currentOCRBadge.disabled = true;
    }
  } else if (state === 'success') {
    element.classList.add('proactive-ai-ocr-success');
    if (currentOCRBadge && currentOCRBadgeTarget === element) {
      currentOCRBadge.classList.add('is-success');
      currentOCRBadge.textContent = ''; // Keep empty on success
      currentOCRBadge.disabled = false; // Re-enable so it can be clicked again
    }
    // Keep the success state - don't auto-remove it
    // It will be removed when user clicks outside (removeImageBadge)
  } else {
    if (currentOCRBadge && currentOCRBadgeTarget === element) {
      currentOCRBadge.classList.remove('is-processing', 'is-success');
      currentOCRBadge.textContent = ''; // Keep empty
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

/**
 * Update analysis trigger button state (processing, success)
 */
function updateAnalysisTriggerState(state) {
  if (!analysisTriggerButton) return;
  
  analysisTriggerButton.classList.remove('is-processing', 'is-success');
  
  if (state === 'processing') {
    analysisTriggerButton.classList.add('is-processing');
  } else if (state === 'success') {
    analysisTriggerButton.classList.add('is-success');
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
  
  if (target.type === 'image') {
    console.log('Image type - running OCR');
    await runImageOCR(target.element, target.position);
    return;
  }
  
  // Mark as BLUE (processing) when user clicks the trigger
  updateAnalysisTriggerState('processing');
  
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
    console.log('📊 Calling showPreparedAnalysis (loading path)...');
    showPreparedAnalysis(target);
    // Mark as GREEN (success) after UI is shown
    updateAnalysisTriggerState('success');
    return;
  }
  
  try {
    console.log('⏳ Awaiting promise (non-loading)...');
    await target.promise;
    console.log('✅ Promise complete');
  } catch (error) {
    console.error('Analysis preparation failed:', error);
  }
  
  console.log('📊 Calling showPreparedAnalysis (final)...');
  showPreparedAnalysis(target);
  // Mark as GREEN (success) after UI is shown
  updateAnalysisTriggerState('success');
}

function handleDocumentClick(event) {
  // Check if clicking on trigger button
  if (analysisTriggerButton && analysisTriggerButton.contains(event.target)) {
    return;
  }
  
  // Check if clicking on OCR badge
  if (currentOCRBadge && currentOCRBadge.contains(event.target)) {
    return;
  }
  
  // Check if clicking inside UI
  // When iframe has pointer-events: auto, clicks inside it won't bubble to document
  // So if we're here and iframe is visible with auto, click is outside UI
  if (event.target.closest && event.target.closest('#proactive-ai-root')) {
    console.log('Click target is inside proactive-ai-root');
    return;
  }
  
  if (suppressNextClickReset) {
    suppressNextClickReset = false;
    return;
  }
  
  // Don't handle image clicks anymore - using hover instead
  
  // Clicked outside - remove trigger and hide UI
  console.log('Click outside UI/trigger, hiding');
  console.log('  pendingAnalysis:', pendingAnalysis);
  console.log('  pendingAnalysis.isProcessing:', pendingAnalysis?.isProcessing);
  
  // Don't hide UI or clear pendingAnalysis if OCR is processing
  if (pendingAnalysis && pendingAnalysis.isProcessing) {
    console.log('⛔ OCR is processing, BLOCKING all state changes!');
    return;
  }
  
  console.log('🚨 Clearing pendingAnalysis!');
  
  // Clear pendingAnalysis first
  pendingAnalysis = null;
  
  // Remove both trigger button and OCR badge
  if (analysisTriggerButton) {
    removeAnalysisTrigger();
  }
  removeImageBadge();
  
  // Hide UI when clicking outside
  hideUI();
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
      // Add timeout protection to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout after 10 seconds')), 10000);
      });
      
      const messagePromise = chrome.runtime.sendMessage({
        action: 'GET_TOOL_SUGGESTIONS',
        data: requestPayload
      });
      
      response = await Promise.race([messagePromise, timeoutPromise]);
      
      if (response && response.success) {
        lastSuggestionKey = cacheKey;
        lastSuggestionResult = response;
        lastSuggestionTimestamp = now;
      }
    } catch (error) {
      if (error?.message?.includes('Extension context invalidated')) {
        console.warn('Extension was reloaded. Request aborted.');
        alert('Proactive AI Assistant was updated. Please refresh this page (F5) to continue using it.');
      } else if (error?.message?.includes('timeout')) {
        console.error('Request timed out:', error);
      } else {
        console.error('Error requesting tool suggestions:', error);
      }
      response = null;
    }
  }
  
  console.log('📊 preparePendingAnalysis: Checking if target is still pending...');
  console.log('  pendingAnalysis === target?', pendingAnalysis === target);
  console.log('  pendingAnalysis:', pendingAnalysis);
  console.log('  target:', target);
  console.log('  target.requestId:', target.requestId);
  console.log('  requestId:', requestId);
  
  if (pendingAnalysis !== target || target.requestId !== requestId) {
    console.warn('📊 preparePendingAnalysis: Target changed or request ID mismatch, aborting');
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
  console.log('📢 showUI called!');
  console.log('  loading:', loading);
  console.log('  tools:', tools);
  console.log('  uiReady:', uiReady);
  
  // Ensure UI is injected before attempting to show
  if (!uiInjected) {
    console.log('Injecting UI...');
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
    console.log('⏳ UI not ready yet, queueing message');
    uiMessageQueue.push(message);
  }
  // Also attempt to post immediately in case UI is already ready
  try {
    if (uiFrame && uiFrame.contentWindow) {
      // Position and show the iframe at the UI position
      uiFrame.style.left = position.x + 'px';
      uiFrame.style.top = position.y + 'px';
      uiFrame.style.display = 'block';
      console.log('✅ Iframe positioned and visible at', position);
      console.log('✅ Sending message to UI iframe');
      uiFrame.contentWindow.postMessage(message, '*');
    } else {
      console.log('✅ Sending message to window (no iframe)');
      window.postMessage(message, '*');
    }
  } catch (e) {
    console.error('Error sending to UI:', e);
  }
  
  // Inject UI if not already injected
  // (already ensured above)
}

/**
 * Hide UI
 */
function hideUI() {
  console.log('🙈 Hiding UI');
  console.trace('hideUI called from:'); // 添加堆栈追踪
  const msg = { type: 'PROACTIVE_AI_HIDE' };
  try {
    if (uiFrame && uiFrame.contentWindow) {
      uiFrame.contentWindow.postMessage(msg, '*');
      // Hide the iframe completely
      uiFrame.style.display = 'none';
      console.log('Iframe hidden (page fully clickable)');
    } else {
      window.postMessage(msg, '*');
    }
  } catch (_) {}
  
  // Don't remove the trigger button when hiding UI!
  // User should be able to click it again to re-open
  console.log('UI hidden, trigger button remains for re-use');
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
    // Start with small size - will be resized when UI shows
    frame.style.left = '0';
    frame.style.top = '0';
    frame.style.width = '362px';  // Slightly wider for content
    frame.style.height = '600px'; // Taller to prevent cutoff
    frame.style.border = '0';
    frame.style.background = 'transparent';
    frame.style.zIndex = '2147483646';
    frame.style.pointerEvents = 'auto'; // Always auto - but only blocks the small UI area!
    frame.style.display = 'none'; // Start hidden
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
    
    // Mark trigger/badge as processing (blue) when tool execution starts
    updateAnalysisTriggerState('processing');
    if (currentOCRBadgeTarget) {
      updateImageBadgeState(currentOCRBadgeTarget, 'processing');
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
        
        // Mark as success (green) after tool completes
        updateAnalysisTriggerState('success');
        if (currentOCRBadgeTarget) {
          updateImageBadgeState(currentOCRBadgeTarget, 'success');
        }

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
      
      // Mark as success (green) after tool completes
      updateAnalysisTriggerState('success');
      if (currentOCRBadgeTarget) {
        updateImageBadgeState(currentOCRBadgeTarget, 'success');
      }
      
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
      
      // Mark as success (green) even on error - tool execution finished
      updateAnalysisTriggerState('success');
      if (currentOCRBadgeTarget) {
        updateImageBadgeState(currentOCRBadgeTarget, 'success');
      }
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

/**
 * Handle image hover to show OCR badge
 */
let hoverTimeout = null;
let badgeRemovalTimeout = null;
let lastHoveredImage = null;

document.addEventListener('mouseover', (event) => {
  // Clear previous timeout
  if (hoverTimeout) {
    clearTimeout(hoverTimeout);
    hoverTimeout = null;
  }
  
  // Check if hovering over an image
  if (isImage(event.target)) {
    // Don't show badge if OCR is processing
    if (pendingAnalysis && pendingAnalysis.isProcessing) {
      return;
    }
    
    // Don't show badge if already showing for this image
    if (currentOCRBadgeTarget === event.target) {
      // Cancel auto-removal if hovering back over the same image
      if (badgeRemovalTimeout) {
        clearTimeout(badgeRemovalTimeout);
        badgeRemovalTimeout = null;
      }
      return;
    }
    
    // Don't show badge on our own UI elements
    if (event.target.closest && event.target.closest('#proactive-ai-root')) {
      return;
    }
    
    lastHoveredImage = event.target;
    
    // Show badge after a short delay (300ms) to avoid showing on quick mouse movements
    hoverTimeout = setTimeout(() => {
      if (lastHoveredImage === event.target) {
        // Don't create badge if it already exists for this image
        if (currentOCRBadgeTarget === event.target) {
          return;
        }
        
        // Cancel any pending removal
        if (badgeRemovalTimeout) {
          clearTimeout(badgeRemovalTimeout);
          badgeRemovalTimeout = null;
        }
        
        selectedText = '';
        selectedElement = event.target;
        const rect = event.target.getBoundingClientRect();
        const triggerPosition = computeUpperRightPosition(rect);
        
        pendingAnalysis = {
          type: 'image',
          element: event.target,
          position: triggerPosition,
          trigger: 'image-hover'
        };
        
        showImageBadge(event.target);
        removeAnalysisTrigger();
      }
    }, 300);
  }
}, true); // Use capture phase to catch events early

document.addEventListener('mouseout', (event) => {
  // When mouse leaves an image with badge, schedule removal after 2 seconds
  if (isImage(event.target) && currentOCRBadgeTarget === event.target) {
    // Check if mouse is moving to the badge itself
    const relatedTarget = event.relatedTarget;
    if (relatedTarget && 
        (relatedTarget === currentOCRBadge || 
         (relatedTarget.closest && relatedTarget.closest('.proactive-ai-ocr-badge')))) {
      // Mouse moved to the badge, don't schedule removal
      return;
    }
    
    // Clear any existing removal timeout
    if (badgeRemovalTimeout) {
      clearTimeout(badgeRemovalTimeout);
    }
    
    // Schedule badge removal after 2 seconds
    badgeRemovalTimeout = setTimeout(() => {
      // Only remove if not processing and badge is still for this element
      if (currentOCRBadgeTarget === event.target && 
          (!pendingAnalysis || !pendingAnalysis.isProcessing)) {
        removeImageBadge();
      }
      badgeRemovalTimeout = null;
    }, 2000);
  }
}, true);

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