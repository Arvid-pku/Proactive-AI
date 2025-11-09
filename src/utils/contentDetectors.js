/**
 * Lightweight content analysis utilities.
 * The goal is to surface raw context for the AI instead of enforcing heuristics.
 */

const HTML_SNAPSHOT_LIMIT = 1200;

function normalizeWhitespace(value = '') {
  return value.replace(/\s+/g, ' ').trim();
}

function describeElement(element) {
  if (!element || !element.tagName) return '';

  const tag = element.tagName.toLowerCase();
  const descriptors = [`<${tag}>`];

  if (element.id) {
    descriptors.push(`#${normalizeWhitespace(element.id)}`);
  }

  const className = typeof element.className === 'string' ? normalizeWhitespace(element.className) : '';
  if (className) {
    const classes = className.split(/\s+/).slice(0, 3).join('.');
    if (classes) {
      descriptors.push(`.${classes}`);
    }
  }

  if (typeof element.getAttribute === 'function') {
    const ariaLabel = normalizeWhitespace(element.getAttribute('aria-label') || '');
    if (ariaLabel) {
      descriptors.push(`aria-label="${ariaLabel.slice(0, 60)}"`);
    }
  }

  if (element.alt) {
    descriptors.push(`alt="${normalizeWhitespace(element.alt).slice(0, 60)}"`);
  }

  return `Element: ${descriptors.join(' ')}`.trim();
}

function captureElementSnapshot(element) {
  try {
    if (!element || typeof element.outerHTML !== 'string') {
      return '';
    }
    const sanitized = normalizeWhitespace(element.outerHTML);
    return sanitized.slice(0, HTML_SNAPSHOT_LIMIT);
  } catch (_) {
    return '';
  }
}

export function analyzeContent(text, element) {
  const rawText = typeof text === 'string' ? text : '';
  const trimmedText = rawText.trim();
  const diagnostics = [];

  if (trimmedText.length) {
    diagnostics.push(`Raw selection length: ${trimmedText.length} chars.`);
  } else if (rawText.length) {
    diagnostics.push('Selection contains whitespace only.');
  } else {
    diagnostics.push('No direct text captured from the selection.');
  }

  const elementDescription = describeElement(element);
  if (elementDescription) {
    diagnostics.push(elementDescription);
  }

  const elementSnapshot = captureElementSnapshot(element);
  if (elementSnapshot) {
    diagnostics.push(`Element snapshot captured (${elementSnapshot.length} chars).`);
  }

  diagnostics.push('Heuristic content classification disabled; delegating tool choice to AI.');

  return {
    types: [],
    diagnostics,
    rawText: trimmedText,
    elementTag: element?.tagName || '',
    elementSnapshot
  };
}

export function getContext(element, maxLength = 500) {
  if (!element) return '';

  let context = '';
  const structuralSnippets = [];

  const heading = element.closest?.('h1, h2, h3, h4, h5, h6');
  if (heading?.innerText) {
    structuralSnippets.push(`Heading: ${heading.innerText.trim()}`);
  }

  if (element.alt) {
    structuralSnippets.push(`Alt text: ${element.alt.trim()}`);
  }

  const labelledAncestor = element.closest?.('[aria-label]');
  if (labelledAncestor) {
    structuralSnippets.push(`Aria label: ${labelledAncestor.getAttribute('aria-label')}`);
  }

  const figureCaption = element.closest?.('figure');
  if (figureCaption) {
    const caption = figureCaption.querySelector('figcaption');
    if (caption?.innerText) {
      structuralSnippets.push(`Caption: ${caption.innerText.trim()}`);
    }
  }

  let parent = element.parentElement;
  while (parent && context.length < maxLength) {
    try {
      const siblingText = Array.from(parent.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent.trim())
        .join(' ');
      context = `${siblingText} ${context}`.trim();
      parent = parent.parentElement;
    } catch (_) {
      break;
    }
  }

  const combined = [...structuralSnippets, context].filter(Boolean).join('\n');
  return combined.slice(-maxLength);
}

export function extractText(element) {
  if (!element) return '';

  if (element.nodeType === Node.TEXT_NODE) {
    return element.textContent.trim();
  }

  return element.innerText || element.textContent || '';
}
