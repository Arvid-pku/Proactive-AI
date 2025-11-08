/**
 * Floating UI Component
 * React-based interface for displaying tools and results
 */

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import './ui.css';
import { TOOL_DEFINITIONS } from '../utils/toolDefinitions.js';

function ProactiveAI() {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [tools, setTools] = useState([]);
  const [content, setContent] = useState('');
  const [fullContent, setFullContent] = useState('');
  const [contentTypes, setContentTypes] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState('tools'); // 'tools' or 'result'
  const [desmosLoaded, setDesmosLoaded] = useState(false);
  
  const containerRef = useRef(null);
  const calculatorRef = useRef(null);
  const graphContainerRef = useRef(null);

  // Load Desmos API
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 20; // Try for 2 seconds (20 * 100ms)
    
    const checkDesmosAvailable = () => {
      if (window.Desmos && window.Desmos.GraphingCalculator) {
        console.log('✅ Desmos API is ready!');
        setDesmosLoaded(true);
        return true;
      }
      return false;
    };

    // Check if already loaded
    if (checkDesmosAvailable()) {
      return;
    }

    // Check if script already exists
    const existingScript = document.querySelector('script[src*="desmos.com/api"]');
    if (existingScript) {
      console.log('Desmos script already in DOM, polling for API...');
      
      const pollInterval = setInterval(() => {
        retryCount++;
        if (checkDesmosAvailable()) {
          clearInterval(pollInterval);
        } else if (retryCount >= maxRetries) {
          console.error('❌ Desmos API timeout after', retryCount, 'attempts');
          clearInterval(pollInterval);
        }
      }, 100);
      
      return () => clearInterval(pollInterval);
    }

    // Load script for the first time
    console.log('Loading Desmos API script...');
    const script = document.createElement('script');
    script.src = 'https://www.desmos.com/api/v1.9/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6';
    
    // Poll for API availability after script loads
    script.onload = () => {
      console.log('Desmos script tag loaded, polling for API availability...');
      
      const pollInterval = setInterval(() => {
        retryCount++;
        
        if (checkDesmosAvailable()) {
          clearInterval(pollInterval);
        } else if (retryCount >= maxRetries) {
          console.error('❌ Desmos API not available after', retryCount, 'attempts');
          console.log('Current window.Desmos:', window.Desmos);
          clearInterval(pollInterval);
        } else {
          console.log(`Polling for Desmos API... attempt ${retryCount}/${maxRetries}`);
        }
      }, 100);
    };
    
    script.onerror = (error) => {
      console.error('❌ Failed to load Desmos script:', error);
    };
    
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    // Listen for messages from content script
    const handleMessage = (event) => {
      if (event.data.type === 'PROACTIVE_AI_SHOW') {
        const { tools, content, fullContent, position, contentTypes } = event.data.payload;
        setTools(tools);
        setContent(content);
        setFullContent(fullContent);
        setPosition(adjustPosition(position));
        setContentTypes(contentTypes);
        setIsVisible(true);
        setActiveView('tools');
        setResult(null);
      } else if (event.data.type === 'PROACTIVE_AI_HIDE') {
        setIsVisible(false);
      } else if (event.data.type === 'PROACTIVE_AI_TOOL_RESULT') {
        setLoading(false);
        if (event.data.payload.success) {
          setResult(event.data.payload.result);
          setActiveView('result');
        } else {
          setResult({
            type: 'error',
            message: event.data.payload.error || 'An error occurred'
          });
          setActiveView('result');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Adjust position to keep UI on screen
  const adjustPosition = (pos) => {
    const padding = 20;
    const maxX = window.innerWidth - 320 - padding;
    const maxY = window.innerHeight - 400 - padding;
    
    return {
      x: Math.min(Math.max(pos.x, padding), maxX),
      y: Math.min(Math.max(pos.y, padding), maxY)
    };
  };

  // Handle tool click
  const handleToolClick = (toolId) => {
    setLoading(true);
    window.postMessage({
      type: 'PROACTIVE_AI_EXECUTE_TOOL',
      payload: {
        toolId,
        content: fullContent
      }
    }, '*');
  };

  // Close UI
  const handleClose = () => {
    setIsVisible(false);
  };

  // Get tool details
  const getToolDetails = (toolId) => {
    return TOOL_DEFINITIONS.find(t => t.id === toolId);
  };

  if (!isVisible) return null;

  return (
    <div
      ref={containerRef}
      className="proactive-ai-container"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`
      }}
    >
      <div className="proactive-ai-header">
        <div className="proactive-ai-title">
          <span className="proactive-ai-icon">✨</span>
          <span>AI Assistant</span>
        </div>
        <button className="proactive-ai-close" onClick={handleClose}>×</button>
      </div>

      {activeView === 'tools' && (
        <div className="proactive-ai-content">
          <div className="proactive-ai-preview">
            <div className="proactive-ai-preview-text">{content}</div>
            {content.length < fullContent.length && (
              <span className="proactive-ai-preview-more">...</span>
            )}
          </div>

          <div className="proactive-ai-types">
            {contentTypes.map(type => (
              <span key={type} className="proactive-ai-type-badge">{type}</span>
            ))}
          </div>

          <div className="proactive-ai-tools">
            {tools.map(toolId => {
              const tool = getToolDetails(toolId);
              if (!tool) return null;
              
              return (
                <button
                  key={toolId}
                  className="proactive-ai-tool-button"
                  onClick={() => handleToolClick(toolId)}
                  disabled={loading}
                >
                  <span className="proactive-ai-tool-icon">{tool.icon}</span>
                  <div className="proactive-ai-tool-info">
                    <div className="proactive-ai-tool-name">{tool.name}</div>
                    <div className="proactive-ai-tool-desc">{tool.description}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {loading && (
            <div className="proactive-ai-loading">
              <div className="proactive-ai-spinner"></div>
              <span>Processing...</span>
            </div>
          )}
        </div>
      )}

      {activeView === 'result' && result && (
        <div className="proactive-ai-content">
          <button 
            className="proactive-ai-back-button"
            onClick={() => setActiveView('tools')}
          >
            ← Back to tools
          </button>

          <div className="proactive-ai-result">
            {result.type === 'text' && (
              <div className="proactive-ai-result-text">
                {result.content}
                
                {result.csvData && (
                  <div style={{ marginTop: '16px' }}>
                    <a 
                      href={result.downloadUrl} 
                      download="table_export.csv"
                      className="proactive-ai-link-button"
                      style={{ display: 'inline-block', marginTop: '8px' }}
                    >
                      📥 Download CSV
                    </a>
                  </div>
                )}
              </div>
            )}

            {result.type === 'success' && (
              <div className="proactive-ai-result-success">
                <span className="proactive-ai-success-icon">✓</span>
                <div>{result.message}</div>
                {result.count && <div className="proactive-ai-result-meta">Total notes: {result.count}</div>}
              </div>
            )}

            {result.type === 'url' && (
              <div className="proactive-ai-result-url">
                <div className="proactive-ai-result-text">{result.instruction}</div>
                
                {result.equation && (
                  <div className="proactive-ai-result-equation">
                    Equation: <code>{result.equation}</code>
                  </div>
                )}
                
                {result.formula && (
                  <div className="proactive-ai-result-equation">
                    Formula: <code>{result.formula}</code>
                  </div>
                )}
                
                {result.citation && (
                  <div className="proactive-ai-result-citation">
                    <strong>Citation:</strong>
                    <div style={{ marginTop: '8px', fontSize: '13px', lineHeight: '1.6' }}>
                      {result.citation}
                    </div>
                  </div>
                )}
                
                <a 
                  href={result.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="proactive-ai-link-button"
                >
                  Open in new tab →
                </a>
              </div>
            )}

            {result.type === 'audio' && (
              <div className="proactive-ai-result-audio">
                <div className="proactive-ai-result-text">{result.instruction}</div>
                <div className="proactive-ai-audio-text">"{result.text}"</div>
              </div>
            )}

            {result.type === 'error' && (
              <div className="proactive-ai-result-error">
                <span className="proactive-ai-error-icon">⚠️</span>
                <div>{result.message}</div>
              </div>
            )}

            {result.type === 'graph' && (
              <div className="proactive-ai-result-graph">
                <div className="proactive-ai-result-text" style={{ marginBottom: '12px' }}>
                  {result.instruction}
                </div>
                
                {result.originalEquation && (
                  <div className="proactive-ai-result-equation">
                    Original: <code>{result.originalEquation}</code>
                  </div>
                )}
                
                <DesmosGraph equation={result.equation} desmosLoaded={desmosLoaded} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Desmos Graph Component
function DesmosGraph({ equation, desmosLoaded }) {
  const graphRef = useRef(null);
  const calculatorInstance = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize calculator once
  useEffect(() => {
    if (desmosLoaded && graphRef.current && !calculatorInstance.current) {
      // Double-check Desmos is actually available
      if (!window.Desmos || !window.Desmos.GraphingCalculator) {
        console.error('Desmos API not available even though desmosLoaded is true');
        setIsInitialized(false);
        return;
      }

      try {
        console.log('Initializing Desmos calculator...');
        
        calculatorInstance.current = window.Desmos.GraphingCalculator(graphRef.current, {
          expressions: true,
          settingsMenu: false,
          zoomButtons: true,
          expressionsTopbar: false,
          border: false,
          lockViewport: false
        });

        setIsInitialized(true);
        console.log('✅ Desmos calculator initialized successfully');
      } catch (error) {
        console.error('❌ Error initializing Desmos:', error);
        calculatorInstance.current = null;
        setIsInitialized(false);
      }
    }

    // Only destroy when component unmounts completely
    return () => {
      if (calculatorInstance.current) {
        console.log('Cleaning up Desmos calculator');
        try {
          calculatorInstance.current.destroy();
        } catch (e) {
          // Silently fail on cleanup errors
        }
        calculatorInstance.current = null;
        setIsInitialized(false);
      }
    };
  }, [desmosLoaded]); // Only depend on desmosLoaded, not equation

  // Update equation when it changes
  useEffect(() => {
    if (isInitialized && calculatorInstance.current && equation) {
      try {
        console.log('Setting equation:', equation);
        
        // Clear previous expressions
        calculatorInstance.current.setBlank();
        
        // Add new equation(s)
        const equations = equation.split(';').map(eq => eq.trim()).filter(eq => eq);
        equations.forEach((eq, index) => {
          calculatorInstance.current.setExpression({
            id: `eq${index}`,
            latex: eq,
            color: index === 0 ? '#2463eb' : `#${Math.floor(Math.random()*16777215).toString(16)}`
          });
        });

        // Set reasonable viewport
        calculatorInstance.current.setMathBounds({
          left: -10,
          right: 10,
          bottom: -10,
          top: 10
        });

        console.log('Equation set successfully');
      } catch (error) {
        console.error('Error setting equation:', error);
      }
    }
  }, [equation, isInitialized]); // Update when equation changes

  if (!desmosLoaded) {
    return (
      <div className="proactive-ai-graph-loading">
        <div className="proactive-ai-spinner"></div>
        <span>Loading graphing calculator...</span>
      </div>
    );
  }

  return (
    <div 
      ref={graphRef} 
      className="proactive-ai-graph-container"
      style={{ width: '100%', height: '300px' }}
    />
  );
}

// Initialize React app
const root = document.getElementById('proactive-ai-root');
if (root) {
  ReactDOM.createRoot(root).render(<ProactiveAI />);
}


