/**
 * OCR Helper - Tesseract.js Integration
 * Performs OCR on images to extract text
 */

// Import Tesseract directly (not dynamic import to avoid chunk loading issues)
import Tesseract from 'tesseract.js';

// Cache worker to avoid repeated initialization
let worker = null;
let workerPromise = null;

/**
 * Initialize Tesseract worker (lazy loading)
 */
async function getWorker() {
  if (worker) return worker;
  
  if (workerPromise) return workerPromise;
  
  workerPromise = (async () => {
    console.log('Initializing Tesseract.js worker...');
    
    // Use CDN paths for worker and core files to avoid extension URL issues
    const newWorker = await Tesseract.createWorker('eng', 1, {
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd.wasm.js',
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });
    worker = newWorker;
    console.log('Tesseract.js worker ready');
    return newWorker;
  })();
  
  return workerPromise;
}

/**
 * Perform OCR on an image element
 * @param {HTMLImageElement|string} imageSource - Image element or URL
 * @returns {Promise<{text: string, confidence: number}>}
 */
export async function performOCR(imageSource) {
  try {
    console.log('Starting OCR...');
    
    const tesseractWorker = await getWorker();
    
    // Perform OCR
    const { data } = await tesseractWorker.recognize(imageSource);
    
    console.log('OCR completed');
    console.log('Extracted text:', data.text);
    console.log('Confidence:', data.confidence);
    
    return {
      text: data.text.trim(),
      confidence: data.confidence,
      words: data.words?.length || 0,
      lines: data.lines?.length || 0
    };
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error(`OCR failed: ${error.message}`);
  }
}

/**
 * Check if an element is an image
 */
export function isImage(element) {
  if (!element) return false;
  
  // Direct img tag
  if (element.tagName === 'IMG') return true;
  
  // Background image
  const style = window.getComputedStyle(element);
  const bgImage = style.backgroundImage;
  if (bgImage && bgImage !== 'none') return true;
  
  // SVG images
  if (element.tagName === 'SVG') return true;
  
  return false;
}

/**
 * Get image source from element
 */
export function getImageSource(element) {
  if (!element) return null;
  
  // IMG tag
  if (element.tagName === 'IMG') {
    return element.src || element.currentSrc;
  }
  
  // Background image
  const style = window.getComputedStyle(element);
  const bgImage = style.backgroundImage;
  if (bgImage && bgImage !== 'none') {
    const urlMatch = bgImage.match(/url\(['"]?(.+?)['"]?\)/);
    if (urlMatch) {
      return urlMatch[1];
    }
  }
  
  // Canvas
  if (element.tagName === 'CANVAS') {
    return element.toDataURL();
  }
  
  return null;
}

/**
 * Extract text from image element
 */
export async function extractTextFromImage(element) {
  if (!isImage(element)) {
    throw new Error('Element is not an image');
  }
  
  const imageSource = getImageSource(element);
  if (!imageSource) {
    throw new Error('Could not get image source');
  }
  
  console.log('Extracting text from image:', imageSource.substring(0, 100));
  
  const result = await performOCR(imageSource);
  
  if (!result.text || result.text.length === 0) {
    throw new Error('No text found in image');
  }
  
  return result;
}

/**
 * Cleanup worker when done
 */
export async function cleanupOCR() {
  if (worker) {
    console.log('Terminating Tesseract worker...');
    await worker.terminate();
    worker = null;
    workerPromise = null;
  }
}

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanupOCR);
}
