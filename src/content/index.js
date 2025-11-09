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
let currentUIPosition = { x: 0, y: 0 };
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
    } else if (
      event.data &&
      event.data.type === 'PROACTIVE_AI_DRAG_DELTA' &&
      event.source === (uiFrame?.contentWindow || null)
    ) {
      const deltaX = Number(event.data.payload?.deltaX || 0);
      const deltaY = Number(event.data.payload?.deltaY || 0);
      if (!uiFrame || (!deltaX && !deltaY)) {
        return;
      }

      const nextPosition = clampUIPosition(currentUIPosition.x + deltaX, currentUIPosition.y + deltaY);
      currentUIPosition = nextPosition;

      uiFrame.style.left = `${nextPosition.x}px`;
      uiFrame.style.top = `${nextPosition.y}px`;
    } else if (
      event.data &&
      event.data.type === 'PROACTIVE_AI_CLICK_OUTSIDE' &&
      event.source === (uiFrame?.contentWindow || null)
    ) {
      // User clicked outside UI in iframe - hide everything
      console.log('Click outside UI detected from iframe');
      
      // Don't hide if OCR is processing
      if (pendingAnalysis && pendingAnalysis.isProcessing) {
        console.log('⛔ OCR is processing, ignoring outside click');
        return;
      }
      
      // Clear state and hide UI
      pendingAnalysis = null;
      removeAnalysisTrigger();
      removeImageBadge();
      hideUI();
    }
  } catch (_) {}
});

function clampUIPosition(x, y) {
  const padding = 8;
  const frameWidth = uiFrame ? parseFloat(uiFrame.style.width) || uiFrame.offsetWidth || 362 : 362;
  const frameHeight = uiFrame ? parseFloat(uiFrame.style.height) || uiFrame.offsetHeight || 600 : 600;
  const maxX = Math.max(padding, window.innerWidth - frameWidth - padding);
  const maxY = Math.max(padding, window.innerHeight - frameHeight - padding);
  return {
    x: Math.min(Math.max(padding, x), maxX),
    y: Math.min(Math.max(padding, y), maxY)
  };
}

window.addEventListener('resize', () => {
  if (!uiFrame) {
    return;
  }
  const nextPosition = clampUIPosition(currentUIPosition.x, currentUIPosition.y);
  currentUIPosition = nextPosition;
  uiFrame.style.left = `${nextPosition.x}px`;
  uiFrame.style.top = `${nextPosition.y}px`;
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
        
        // Clear isProcessing immediately - UI is ready
        if (target) {
          target.isProcessing = false;
        }
        
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
    // Clear isProcessing flag immediately when OCR completes or fails
    if (pendingAnalysis && pendingAnalysis.isProcessing) {
      pendingAnalysis.isProcessing = false;
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
    // Update pet animation - working
    updatePetForBadgeState('processing');
  } else if (state === 'success') {
    element.classList.add('proactive-ai-ocr-success');
    if (currentOCRBadge && currentOCRBadgeTarget === element) {
      currentOCRBadge.classList.add('is-success');
      currentOCRBadge.textContent = ''; // Keep empty on success
      currentOCRBadge.disabled = false; // Re-enable so it can be clicked again
    }
    // Update pet animation - celebrating
    updatePetForBadgeState('success');
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
    
    // Reset pet to waiting state when OCR badge is removed
    updatePetForBadgeState('none');
  }
  
  // Remove all OCR-related classes from all elements
  document.querySelectorAll('.proactive-ai-ocr-detected, .proactive-ai-ocr-processing, .proactive-ai-ocr-success').forEach(el => {
    el.classList.remove('proactive-ai-ocr-detected', 'proactive-ai-ocr-processing', 'proactive-ai-ocr-success');
  });
}

function showAnalysisTrigger(position, { label = '', onActivate } = {}) {
  // Don't recreate if button already exists
  if (analysisTriggerButton) {
    console.log('Trigger button already exists, skipping recreation');
    return;
  }
  
  // Don't remove existing trigger - the check above should prevent this
  // removeAnalysisTrigger();
  
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
    
    // Reset pet to waiting state when badge is removed
    updatePetForBadgeState('none');
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
    updatePetForBadgeState('processing');
  } else if (state === 'success') {
    analysisTriggerButton.classList.add('is-success');
    updatePetForBadgeState('success');
  }
}

/**
 * Update pet animation based on badge state
 */
function updatePetForBadgeState(state) {
  // Get reference to pet elements
  const fab = document.getElementById('proactive-ai-fab');
  if (!fab) return;
  
  const petImg = fab.querySelector('img');
  if (!petImg) return;
  
  // Get current pet animation state from the closure
  // We'll access these through a global object
  if (!window.__petState) return;
  
  const { petAnimationState, setPetImg, clearIdleAction } = window.__petState;
  
  // Don't interrupt user interaction (hovering)
  if (petAnimationState === 'touching' || petAnimationState === 'touched') {
    return;
  }
  
  if (state === 'processing') {
    // Blue badge - pet is busy working
    clearIdleAction();
    setPetImg('busy');
  } else if (state === 'success') {
    // Green badge - pet is yelling (excited about success)
    clearIdleAction();
    setPetImg('yelling');
  } else {
    // No badge or badge removed - return to waiting
    setPetImg('waitting');
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
  
  // Don't check if target changed - always set the tools!
  // The target object is passed by reference, so updating it is fine
  console.log('📊 Setting tools on target (AI response received)');
  
  target.loading = false;
  
  if (response && response.success && Array.isArray(response.tools)) {
    target.tools = response.tools.slice(0, 4);
    target.response = response;
    console.log('✅ AI suggested tools:', target.tools);
  } else if (response && Array.isArray(response.tools)) {
    target.tools = response.tools.slice(0, 4);
    target.response = response;
    console.log('✅ Tools from response:', target.tools);
  } else {
    target.tools = computeFallbackTools(contentTypes);
    target.response = { success: false, fallback: true, tools: target.tools };
    console.log('⚠️ No AI response, using fallback tools:', target.tools);
  }
  
  if (!target.tools || target.tools.length === 0) {
    target.tools = computeFallbackTools(contentTypes);
    console.log('⚠️ Empty tools, using fallback:', target.tools);
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
  
  // Clear suppressNextClickReset when showing UI so clicks work immediately
  suppressNextClickReset = false;
  
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

  const clampedPosition = clampUIPosition(position.x, position.y);
  currentUIPosition = clampedPosition;

  const message = {
    type: 'PROACTIVE_AI_SHOW',
    payload: {
      tools,
      content: content.slice(0, 200), // Preview only
      fullContent: content,
      position: clampedPosition,
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
  uiFrame.style.left = clampedPosition.x + 'px';
  uiFrame.style.top = clampedPosition.y + 'px';
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
    frame.style.width = '380px';  // Slightly wider for content
    frame.style.height = '700px'; // Taller to prevent cutoff
    frame.style.border = '0';
    frame.style.background = 'transparent';
    frame.style.zIndex = '2147483646';
    frame.style.pointerEvents = 'auto'; // Need auto for UI buttons to work
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
  
  // Create floating action button (FAB) - Desktop Pet
  const fab = document.createElement('div');
  fab.id = 'proactive-ai-fab';
  
  // Create image element for the pet GIF
  const petImg = document.createElement('img');
  petImg.src = chrome.runtime.getURL('src/imgs/waitting.gif');
  petImg.alt = 'AI Pet';
  petImg.style.width = '100%';
  petImg.style.height = '100%';
  petImg.style.objectFit = 'contain';
  petImg.style.pointerEvents = 'auto'; // Need to receive hover events
  petImg.style.cursor = 'pointer';
  fab.appendChild(petImg);
  
  // Create speech bubble tooltip
  const speechBubble = document.createElement('div');
  speechBubble.className = 'proactive-ai-pet-bubble';
  speechBubble.textContent = 'Click me to open Assistant Panel!';
  speechBubble.style.display = 'none'; // Hidden by default
  fab.appendChild(speechBubble);
  
  // Pet animation state
  let petAnimationState = 'waiting'; // 'waiting', 'touching', 'touched'
  let petTransitionTimeout = null;
  
  // Hover on FAB (includes pet image and speech bubble)
  fab.addEventListener('mouseenter', () => {
    // Show speech bubble
    speechBubble.style.display = 'block';
    
    // Add hover class for scaling effect
    fab.classList.add('pet-hovering');
    
    // Completely hide summary bubble when hovering pet
    if (summaryBubble) {
      summaryBubble.style.opacity = '0';
      summaryBubble.style.visibility = 'hidden';
      summaryBubble.style.pointerEvents = 'none';
    }
    
    if (petAnimationState === 'waiting') {
      petAnimationState = 'touching';
      
      // Clear any existing timeout
      if (petTransitionTimeout) {
        clearTimeout(petTransitionTimeout);
        petTransitionTimeout = null;
      }
      
      // Play be_touched.gif once
      petImg.src = chrome.runtime.getURL('src/imgs/be_touched.gif');
      
      // After be_touched finishes, switch to ontouch loop
      petTransitionTimeout = setTimeout(() => {
        petAnimationState = 'touched';
        petImg.src = chrome.runtime.getURL('src/imgs/ontouch.gif');
        petTransitionTimeout = null;
      }, 500);
    }
  });
  
  // Mouse leave FAB
  fab.addEventListener('mouseleave', () => {
    // Hide speech bubble
    speechBubble.style.display = 'none';
    
    // Remove hover class
    fab.classList.remove('pet-hovering');
    
    // Restore summary bubble visibility when leaving pet
    if (summaryBubble) {
      summaryBubble.style.opacity = '1';
      summaryBubble.style.visibility = 'visible';
      summaryBubble.style.pointerEvents = 'auto';
    }
    
    if (petAnimationState === 'touched' || petAnimationState === 'touching') {
      // Clear any existing timeout
      if (petTransitionTimeout) {
        clearTimeout(petTransitionTimeout);
        petTransitionTimeout = null;
      }
      
      // Play back_to_waitting.gif once
      petImg.src = chrome.runtime.getURL('src/imgs/back_to_waitting.gif');
      
      // After back_to_waitting finishes, switch to waitting loop
      petTransitionTimeout = setTimeout(() => {
        petAnimationState = 'waiting';
        petImg.src = chrome.runtime.getURL('src/imgs/waitting.gif');
        petTransitionTimeout = null;
      }, 500);
    }
  });
  
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
  
  // Expose pet control functions globally for badge state updates
  window.__petState = {
    get petAnimationState() { return petAnimationState; },
    setPetImg: (gifName) => {
      // Don't interrupt user interaction
      if (petAnimationState === 'touching' || petAnimationState === 'touched') {
        return;
      }
      
      petImg.src = chrome.runtime.getURL(`src/imgs/${gifName}.gif`);
      
      // Update state based on animation
      if (gifName === 'waitting') {
        petAnimationState = 'waiting';
      } else {
        // Mark as working or celebrating (not waiting)
        petAnimationState = 'working';
      }
    },
    clearIdleAction: () => {
      // No idle actions to clear anymore
    }
  };
  
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
  
  // Don't trigger on our own UI elements
  if (event.target.closest && event.target.closest('#proactive-ai-root')) {
    return;
  }
  
  // Don't trigger on FAB (pet) or summary bubble
  if (event.target.closest && (
      event.target.closest('#proactive-ai-fab') ||
      event.target.closest('.proactive-ai-summary-bubble')
  )) {
    return;
  }
  
  // Don't trigger on trigger button or OCR badge
  if (event.target === analysisTriggerButton || 
      event.target === currentOCRBadge ||
      event.target.classList.contains('proactive-ai-trigger') ||
      event.target.classList.contains('proactive-ai-ocr-badge')) {
    return;
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

/**
 * ========================================
 * WEBSITE SUMMARY FEATURE (Independent Module)
 * ========================================
 */

// State for website summary
let summaryBubble = null;
let summaryContent = null;
let summaryLoading = false;
let katexLoaded = false;

/**
 * Load KaTeX library dynamically
 * NOTE: Due to CSP restrictions in content scripts, we cannot load external scripts.
 * Instead, we'll use a simpler approach with basic LaTeX symbol replacement.
 */
function loadKaTeX() {
  // Mark as loaded immediately - we're not actually loading KaTeX
  katexLoaded = true;
  return Promise.resolve();
}

/**
 * Create and show website summary bubble
 */
async function showWebsiteSummary() {
  // Don't show if already exists
  if (summaryBubble) return;
  
  const fab = document.getElementById('proactive-ai-fab');
  if (!fab) {
    console.warn('FAB not found, cannot show summary');
    return;
  }
  
  // Create summary bubble as independent element (not child of fab)
  const bubble = document.createElement('div');
  bubble.className = 'proactive-ai-summary-bubble';
  bubble.innerHTML = `
    <div class="summary-header">
      <span class="summary-title">📄 Page Summary</span>
      <button class="summary-close" aria-label="Close summary">×</button>
    </div>
    <div class="summary-body">
      <div class="summary-loading">Generating summary...</div>
    </div>
  `;
  
  // Position independently using fixed positioning
  bubble.style.opacity = '0';
  document.body.appendChild(bubble);
  summaryBubble = bubble;
  
  // Calculate position relative to pet
  const fabRect = fab.getBoundingClientRect();
  bubble.style.position = 'fixed';
  bubble.style.bottom = `${window.innerHeight - fabRect.top + 16}px`;
  bubble.style.right = `${window.innerWidth - fabRect.right}px`;
  
  // Fade in animation
  setTimeout(() => {
    bubble.style.opacity = '1';
  }, 100);
  
  // Close button handler - completely independent
  const closeBtn = bubble.querySelector('.summary-close');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    closeSummaryBubble();
  });
  
  // Summary bubble hover events - completely independent from pet
  bubble.addEventListener('mouseenter', () => {
    // Just keep summary visible and interactive
    bubble.style.opacity = '1';
    bubble.style.visibility = 'visible';
    bubble.style.pointerEvents = 'auto';
  });
  
  bubble.addEventListener('mouseleave', () => {
    // Keep summary visible when mouse leaves (unless manually closed)
    bubble.style.opacity = '1';
    bubble.style.visibility = 'visible';
  });
  
  // Fetch summary from AI
  await generateWebsiteSummary();
}

/**
 * Generate website summary using AI
 */
async function generateWebsiteSummary() {
  if (summaryLoading) return;
  summaryLoading = true;
  
  try {
    // Extract page content
    const pageTitle = document.title || '';
    const pageUrl = window.location.href;
    
    // Get main text content (limit to first 2000 chars for performance)
    let pageText = '';
    const bodyText = document.body.innerText || document.body.textContent || '';
    pageText = bodyText.slice(0, 2000).trim();
    
    // Get meta description if available
    const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
    
    // Prepare request with enhanced prompt for structured summary
    const summaryRequest = {
      pageTitle,
      pageUrl,
      pageText,
      metaDescription: metaDesc,
      prompt: `Please provide a well-structured summary of this webpage using the following format:

**Main Topic:** [One sentence describing the primary subject]

**Key Points:**
• [First key point or concept]
• [Second key point or concept]
• [Third key point if applicable]

**Summary:** [2-3 sentence overview of the content]

Guidelines:
- Use **bold** for emphasis on important terms
- Use *italic* for secondary emphasis
- Use LaTeX notation for math: $ for inline (e.g., $x^2$) or $$ for display (e.g., $$\\int_0^1 x dx$$)
- Use \`code\` for technical terms or code snippets
- Keep it concise and informative
- Focus on the most valuable information for quick understanding`
    };
    
    console.log('Requesting website summary...');
    
    // Call background script to get AI summary
    const response = await chrome.runtime.sendMessage({
      action: 'GENERATE_PAGE_SUMMARY',
      data: summaryRequest
    });
    
    console.log('Summary response:', response);
    
    if (response && response.success && response.summary) {
      displaySummary(response.summary);
    } else {
      displaySummary('Unable to generate summary. Please try again later.');
    }
  } catch (error) {
    console.error('Error generating summary:', error);
    displaySummary('Error generating summary. Please try again later.');
  } finally {
    summaryLoading = false;
  }
}

/**
 * Display summary content in bubble with LaTeX and Markdown support
 */
async function displaySummary(text) {
  if (!summaryBubble) return;
  
  const bodyEl = summaryBubble.querySelector('.summary-body');
  if (!bodyEl) return;
  
  // Process Markdown and convert LaTeX to readable format
  const processedText = renderMarkdownAndLatex(text);
  bodyEl.innerHTML = `<div class="summary-text">${processedText}</div>`;
  
  // Note: Due to CSP restrictions, we cannot load external KaTeX library
  // The LaTeX will be displayed with basic Unicode math symbols
}

/**
 * Simple Markdown and LaTeX renderer
 * Converts LaTeX to Unicode math symbols for display without external libraries
 */
function renderMarkdownAndLatex(text) {
  let processed = text;
  
  // First, protect LaTeX expressions from HTML escaping and Markdown processing
  const latexExpressions = [];
  
  // Extract display math $$...$$ (non-greedy, multiline)
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
    const index = latexExpressions.length;
    latexExpressions.push({type: 'display', content: content.trim()});
    return `___LATEX_DISPLAY_${index}___`;
  });
  
  // Extract display math \[...\] (non-greedy, multiline)
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (match, content) => {
    const index = latexExpressions.length;
    latexExpressions.push({type: 'display', content: content.trim()});
    return `___LATEX_DISPLAY_${index}___`;
  });
  
  // Extract inline math $...$ (non-greedy, single line)
  processed = processed.replace(/\$([^\$\n]+?)\$/g, (match, content) => {
    const index = latexExpressions.length;
    latexExpressions.push({type: 'inline', content: content.trim()});
    return `___LATEX_INLINE_${index}___`;
  });
  
  // Extract inline math \(...\) (non-greedy)
  processed = processed.replace(/\\\((.*?)\\\)/g, (match, content) => {
    const index = latexExpressions.length;
    latexExpressions.push({type: 'inline', content: content.trim()});
    return `___LATEX_INLINE_${index}___`;
  });
  
  // Now escape dangerous HTML (but preserve placeholders)
  processed = processed.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Process Markdown
  // Bold **text**
  processed = processed.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  
  // Italic *text* (single asterisk not part of **)
  processed = processed.replace(/(?<!\*)\*([^*\s][^*]*?)\*(?!\*)/g, '<em>$1</em>');
  
  // Inline code `code`
  processed = processed.replace(/`([^`]+?)`/g, '<code>$1</code>');
  
  // Headers with line breaks after them
  processed = processed.replace(/^### (.+)$/gm, '<h3>$1</h3><br>');
  processed = processed.replace(/^## (.+)$/gm, '<h2>$1</h2><br>');
  processed = processed.replace(/^# (.+)$/gm, '<h1>$1</h1><br>');
  
  // Line breaks for remaining newlines
  processed = processed.replace(/\n/g, '<br>');
  
  // Restore LaTeX expressions with Unicode conversion
  processed = processed.replace(/___LATEX_DISPLAY_(\d+)___/g, (match, index) => {
    const latex = latexExpressions[parseInt(index)];
    const converted = convertLatexToUnicode(latex.content);
    return `<div class="math-display">${converted}</div>`;
  });
  
  processed = processed.replace(/___LATEX_INLINE_(\d+)___/g, (match, index) => {
    const latex = latexExpressions[parseInt(index)];
    const converted = convertLatexToUnicode(latex.content);
    return `<span class="math-inline">${converted}</span>`;
  });
  
  return processed;
}

/**
 * Convert common LaTeX symbols to Unicode
 */
function convertLatexToUnicode(latex) {
  let result = latex;
  
  // Common Greek letters
  const greekMap = {
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
    '\\epsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η', '\\theta': 'θ',
    '\\iota': 'ι', '\\kappa': 'κ', '\\lambda': 'λ', '\\mu': 'μ',
    '\\nu': 'ν', '\\xi': 'ξ', '\\pi': 'π', '\\rho': 'ρ',
    '\\sigma': 'σ', '\\tau': 'τ', '\\phi': 'φ', '\\chi': 'χ',
    '\\psi': 'ψ', '\\omega': 'ω',
    '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ',
    '\\Xi': 'Ξ', '\\Pi': 'Π', '\\Sigma': 'Σ', '\\Phi': 'Φ',
    '\\Psi': 'Ψ', '\\Omega': 'Ω'
  };
  
  // Math operators and symbols
  const symbolMap = {
    '\\infty': '∞', '\\partial': '∂', '\\nabla': '∇',
    '\\sum': '∑', '\\prod': '∏', '\\int': '∫',
    '\\pm': '±', '\\mp': '∓', '\\times': '×', '\\div': '÷',
    '\\cdot': '·', '\\neq': '≠', '\\leq': '≤', '\\geq': '≥',
    '\\approx': '≈', '\\equiv': '≡', '\\sim': '∼',
    '\\propto': '∝', '\\in': '∈', '\\notin': '∉',
    '\\subset': '⊂', '\\supset': '⊃', '\\subseteq': '⊆', '\\supseteq': '⊇',
    '\\cup': '∪', '\\cap': '∩', '\\emptyset': '∅',
    '\\forall': '∀', '\\exists': '∃', '\\nexists': '∄',
    '\\rightarrow': '→', '\\leftarrow': '←', '\\leftrightarrow': '↔',
    '\\Rightarrow': '⇒', '\\Leftarrow': '⇐', '\\Leftrightarrow': '⇔',
    '\\sqrt': '√', '\\angle': '∠', '\\perp': '⊥', '\\parallel': '∥'
  };
  
  // Replace Greek letters
  for (const [latex, unicode] of Object.entries(greekMap)) {
    result = result.replace(new RegExp(latex.replace('\\', '\\\\'), 'g'), unicode);
  }
  
  // Replace symbols
  for (const [latex, unicode] of Object.entries(symbolMap)) {
    result = result.replace(new RegExp(latex.replace('\\', '\\\\'), 'g'), unicode);
  }
  
  // Handle fractions \frac{a}{b} -> a/b
  result = result.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)');
  
  // Handle superscripts ^{} or ^x
  result = result.replace(/\^{([^}]+)}/g, (match, p1) => {
    return toSuperscript(p1);
  });
  result = result.replace(/\^([a-zA-Z0-9])/g, (match, p1) => {
    return toSuperscript(p1);
  });
  
  // Handle subscripts _{} or _x
  result = result.replace(/_{([^}]+)}/g, (match, p1) => {
    return toSubscript(p1);
  });
  result = result.replace(/_([a-zA-Z0-9])/g, (match, p1) => {
    return toSubscript(p1);
  });
  
  // Clean up remaining LaTeX commands (just remove backslashes)
  result = result.replace(/\\([a-zA-Z]+)/g, '$1');
  
  // Clean up extra braces
  result = result.replace(/[{}]/g, '');
  
  return result;
}

/**
 * Convert text to superscript Unicode
 */
function toSuperscript(text) {
  const superscriptMap = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ',
    'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ',
    'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ',
    'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ',
    'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾'
  };
  
  return text.split('').map(char => superscriptMap[char] || char).join('');
}

/**
 * Convert text to subscript Unicode
 */
function toSubscript(text) {
  const subscriptMap = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
    'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
    'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ',
    'v': 'ᵥ', 'x': 'ₓ',
    '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎'
  };
  
  return text.split('').map(char => subscriptMap[char] || char).join('');
}

/**
 * Close and remove summary bubble
 */
function closeSummaryBubble() {
  if (!summaryBubble) return;
  
  // Fade out
  summaryBubble.style.opacity = '0';
  
  setTimeout(() => {
    if (summaryBubble && summaryBubble.parentNode) {
      summaryBubble.remove();
    }
    summaryBubble = null;
    summaryContent = null;
  }, 300);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * ========================================
 * END OF WEBSITE SUMMARY FEATURE
 * ========================================
 */

console.log('Proactive AI Assistant content script loaded');

// Ensure UI is injected on page load so FAB and iframe are available
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    try {
      injectUI();
      // Show website summary after a short delay
      setTimeout(() => {
        showWebsiteSummary();
      }, 2000);
    } catch (e) {
      // ignore
    }
  });
} else {
  try {
    injectUI();
    // Show website summary after a short delay
    setTimeout(() => {
      showWebsiteSummary();
    }, 2000);
  } catch (e) {
    // ignore
  }
}