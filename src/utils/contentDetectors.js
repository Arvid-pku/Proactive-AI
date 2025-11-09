/**
 * Content Detectors - Identify different types of content
 */

// Detect mathematical expressions
export function detectMath(text) {
  const mathPatterns = [
    /[0-9a-z]*x[\^²³⁴]?[+-]?[0-9]*/i,  // Basic algebraic
    /\b(sin|cos|tan|log|ln|sqrt|exp)\(/i,  // Functions
    /[∫∑∏∂∇]/,  // Calculus symbols
    /\d+\/\d+/,  // Fractions
    /[a-z]\s*=\s*[^=]/i,  // Equations
    /f\(x\)|g\(x\)|h\(x\)/i,  // Function notation
    /lim|derivative|integral/i,
    /\\frac|\\sqrt|\\sum|\\int/  // LaTeX
  ];
  
  return mathPatterns.some(pattern => pattern.test(text));
}

// Detect code snippets
export function detectCode(text) {
  const codePatterns = [
    /function\s+\w+\s*\(/,
    /class\s+\w+/,
    /const\s+\w+\s*=/,
    /let\s+\w+\s*=/,
    /var\s+\w+\s*=/,
    /def\s+\w+\s*\(/,
    /import\s+.*from/,
    /console\.log/,
    /return\s+/,
    /#include|using namespace/,
    /public\s+static\s+void/,
    /<\?php/,
    /```[\s\S]*```/
  ];
  
  return codePatterns.some(pattern => pattern.test(text));
}

// Detect foreign language (non-English)
export function detectForeignLanguage(text) {
  // Check for common non-English characters
  const nonEnglishPatterns = [
    /[\u4E00-\u9FFF]/, // Chinese
    /[\u3040-\u309F\u30A0-\u30FF]/, // Japanese
    /[\uAC00-\uD7AF]/, // Korean
    /[\u0400-\u04FF]/, // Cyrillic
    /[\u0600-\u06FF]/, // Arabic
    /[\u0900-\u097F]/, // Devanagari (Hindi)
    /[àáâãäåèéêëìíîïòóôõöùúûüýÿñçæœ]/i // Accented characters
  ];
  
  return nonEnglishPatterns.some(pattern => pattern.test(text));
}

// Detect chemical formulas
export function detectChemical(text) {
  if (!text) return false;

  // Obvious chemistry keywords
  const keywordPattern = /\b(acid|base|molecule|compound|ion|pH)\b/i;
  if (keywordPattern.test(text)) return true;

  // Heuristic for formula-like tokens (e.g., H2O, NaCl, CH3CH2OH)
  // Avoid matching all-caps acronyms like NICE/CPU by requiring at least one
  // lowercase letter or digit, and at least two element-like chunks overall.
  const tokens = text.split(/\s+/).slice(0, 100); // limit scan
  for (const raw of tokens) {
    const t = raw.replace(/[^A-Za-z0-9]/g, '');
    if (!t || t.length < 2 || t.length > 24) continue;
    if (/^[A-Z]{2,}$/.test(t)) continue; // pure acronym -> skip
    if (!/[a-z0-9]/.test(t)) continue; // must contain lowercase or digit
    if (/^(?:[A-Z][a-z]?\d*){2,}$/.test(t)) return true; // looks like a formula
  }

  return false;
}

// Detect dates and historical events
export function detectHistorical(text) {
  const histPatterns = [
    /\b\d{4}\b/,  // Year
    /\b(BC|AD|BCE|CE)\b/,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i,
    /\b(war|battle|revolution|empire|dynasty)/i
  ];
  
  return histPatterns.some(pattern => pattern.test(text));
}

// Detect tables/data
export function detectTable(element) {
  if (!element || !element.tagName) return false;
  
  return element.tagName === 'TABLE' || 
         (element.querySelectorAll && element.querySelectorAll('td, th').length > 3);
}

// Detect citations/references
export function detectCitation(text) {
  const citPatterns = [
    /\[[0-9]+\]/,  // [1], [2]
    /\b(et al\.|ibid\.|op\. cit\.)/i,
    /doi:|DOI:/,
    /arXiv:/,
    /\(\d{4}\)/  // Year in parentheses
  ];
  
  return citPatterns.some(pattern => pattern.test(text));
}

// Detect URLs/links
export function detectURL(text) {
  return /https?:\/\/[^\s]+/.test(text);
}

// Detect images
export function detectImage(element) {
  if (!element || !element.tagName) return false;
  
  // Direct img tag
  if (element.tagName === 'IMG') return true;
  
  // Background image
  try {
    const style = window.getComputedStyle(element);
    const bgImage = style.backgroundImage;
    if (bgImage && bgImage !== 'none') return true;
  } catch (e) {
    // Ignore styling errors
  }
  
  // Canvas or SVG
  if (element.tagName === 'CANVAS' || element.tagName === 'SVG') return true;
  
  return false;
}

// Determine content type priority
export function analyzeContent(text, element) {
  const types = [];
  const diagnostics = [];
  
  if (detectImage(element)) {
    types.push('image');
    diagnostics.push('Image element detected via tag, background, canvas, or SVG.');
    return { types, diagnostics };
  }
  
  if (detectMath(text)) {
    types.push('math');
    diagnostics.push('Mathematical notation detected (operators, functions, or LaTeX).');
  }
  if (detectCode(text)) {
    types.push('code');
    diagnostics.push('Code keywords or syntax elements detected.');
  }
  if (detectForeignLanguage(text)) {
    types.push('foreign');
    diagnostics.push('Non-Latin or accented characters detected.');
  }
  if (detectChemical(text)) {
    types.push('chemical');
    diagnostics.push('Chemical formulas or terminology detected.');
  }
  if (detectHistorical(text)) {
    types.push('historical');
    diagnostics.push('Historical dates or keywords detected.');
  }
  if (detectTable(element)) {
    types.push('table');
    diagnostics.push('Table structure detected in DOM.');
  }
  if (detectCitation(text)) {
    types.push('citation');
    diagnostics.push('Citation markers (DOI, arXiv, [1], etc.) detected.');
  }
  if (detectURL(text)) {
    types.push('url');
    diagnostics.push('URL detected in the selection.');
  }
  
  if (types.length === 0) {
    types.push('text');
    diagnostics.push('Defaulted to general text content.');
  }
  
  return { types, diagnostics };
}

// Get surrounding context
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
  
  // Get parent context
  let parent = element.parentElement;
  while (parent && context.length < maxLength) {
    try {
      const siblingText = Array.from(parent.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent.trim())
        .join(' ');
      context = siblingText + ' ' + context;
      parent = parent.parentElement;
    } catch (e) {
      // Stop if we encounter any errors
      break;
    }
  }
  
  const combined = [...structuralSnippets, context.trim()].filter(Boolean).join('\n');
  return combined.slice(-maxLength);
}

// Extract clean text from element
export function extractText(element) {
  if (!element) return '';
  
  // For text nodes
  if (element.nodeType === Node.TEXT_NODE) {
    return element.textContent.trim();
  }
  
  // For elements
  return element.innerText || element.textContent || '';
}
