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
  const chemPatterns = [
    /\b[A-Z][a-z]?\d*([A-Z][a-z]?\d*)+\b/,  // H2O, CO2, etc.
    /\bCH\d+/,  // Organic chemistry
    /\b(acid|base|molecule|compound|ion|pH)\b/i
  ];
  
  return chemPatterns.some(pattern => pattern.test(text));
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

// Determine content type priority
export function analyzeContent(text, element) {
  const types = [];
  
  if (detectMath(text)) types.push('math');
  if (detectCode(text)) types.push('code');
  if (detectForeignLanguage(text)) types.push('foreign');
  if (detectChemical(text)) types.push('chemical');
  if (detectHistorical(text)) types.push('historical');
  if (detectTable(element)) types.push('table');
  if (detectCitation(text)) types.push('citation');
  if (detectURL(text)) types.push('url');
  
  // Default to general text
  if (types.length === 0) types.push('text');
  
  return types;
}

// Get surrounding context
export function getContext(element, maxLength = 500) {
  if (!element) return '';
  
  let context = '';
  
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
  
  return context.trim().slice(-maxLength);
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

