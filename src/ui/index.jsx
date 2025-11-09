/**
 * Floating UI Component
 * React-based interface for displaying tools and results
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import './ui.css';
import { TOOL_DEFINITIONS } from '../utils/toolDefinitions.js';
import Plotly from 'plotly.js-dist-min';

function ProactiveAI() {
  const [isVisible, setIsVisible] = useState(false);
  const DEFAULT_OFFSET = 8;
  const [position, setPosition] = useState({ x: DEFAULT_OFFSET, y: DEFAULT_OFFSET });
  const [tools, setTools] = useState([]);
  const [content, setContent] = useState('');
  const [fullContent, setFullContent] = useState('');
  const [contentTypes, setContentTypes] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState('tools'); // 'tools' or 'result'
  const [metadata, setMetadata] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const containerRef = useRef(null);
  const dragStateRef = useRef({
    pointerId: null,
    lastClientX: 0,
    lastClientY: 0,
    originalUserSelect: ''
  });

  const handlePointerDown = useCallback((event) => {
    if (event.target.closest('.proactive-ai-close')) {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    event.preventDefault();

    dragStateRef.current = {
      pointerId: event.pointerId,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      originalUserSelect: typeof document !== 'undefined' ? document.body.style.userSelect : ''
    };

    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = 'none';
    }
  }, []);

  const handlePointerMove = useCallback((event) => {
    if (dragStateRef.current.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();

    const { lastClientX, lastClientY } = dragStateRef.current;
    const deltaX = event.clientX - lastClientX;
    const deltaY = event.clientY - lastClientY;
    dragStateRef.current.lastClientX = event.clientX;
    dragStateRef.current.lastClientY = event.clientY;

    if (deltaX || deltaY) {
      const dragMessage = {
        type: 'PROACTIVE_AI_DRAG_DELTA',
        payload: { deltaX, deltaY }
      };
      try {
        window.postMessage(dragMessage, '*');
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(dragMessage, '*');
        }
      } catch (error) {
        console.error('Failed to notify parent about drag delta:', error);
      }
    }
  }, []);

  const handlePointerUp = useCallback((event) => {
    if (dragStateRef.current.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const { originalUserSelect } = dragStateRef.current;
    dragStateRef.current = {
      pointerId: null,
      lastClientX: 0,
      lastClientY: 0,
      originalUserSelect: ''
    };
    setIsDragging(false);
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = originalUserSelect;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.userSelect = dragStateRef.current.originalUserSelect || '';
      }
      dragStateRef.current = {
        pointerId: null,
        lastClientX: 0,
        lastClientY: 0,
        originalUserSelect: ''
      };
    };
  }, []);

  useEffect(() => {
    if (!isVisible && isDragging) {
      if (typeof document !== 'undefined') {
        document.body.style.userSelect = dragStateRef.current.originalUserSelect || '';
      }
      dragStateRef.current = {
        pointerId: null,
        lastClientX: 0,
        lastClientY: 0,
        originalUserSelect: ''
      };
      setIsDragging(false);
    }
  }, [isVisible, isDragging]);

  // Listen for clicks outside the UI container
  useEffect(() => {
    if (!isVisible) return;

    const handleClickOutside = (event) => {
      // Check if click is outside the UI container
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        console.log('Click outside UI container in iframe, notifying parent');
        // Notify parent window (content script) to hide UI
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'PROACTIVE_AI_CLICK_OUTSIDE' }, '*');
          }
        } catch (e) {
          console.error('Failed to notify parent about outside click:', e);
        }
      }
    };

    // Add listener to iframe's document
    document.addEventListener('click', handleClickOutside, true);
    
    return () => {
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [isVisible]);

  useEffect(() => {
    // Listen for messages from content script
    const handleMessage = (event) => {
      if (event.data.type === 'PROACTIVE_AI_SHOW') {
        const {
          tools: incomingTools,
          content: snippet,
          fullContent: full,
          position: triggerPosition,
          contentTypes: detectedTypes,
          metadata: incomingMetadata,
          loading: isLoading
        } = event.data.payload;
        setTools(incomingTools);
        setContent(snippet);
    setFullContent(full);
    setPosition({ x: DEFAULT_OFFSET, y: DEFAULT_OFFSET });
        setContentTypes(detectedTypes);
        setMetadata(incomingMetadata || null);
        setLoading(Boolean(isLoading));
        setIsVisible(true);
        setActiveView('tools');
        setResult(null);
      } else if (event.data.type === 'PROACTIVE_AI_HIDE') {
        setIsVisible(false);
        setMetadata(null);
        setLoading(false);
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
    // Notify content script that UI is ready to receive messages
    try {
      const readyMsg = { type: 'PROACTIVE_AI_UI_READY' };
      window.postMessage(readyMsg, '*');
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(readyMsg, '*');
      }
    } catch (e) {
      // ignore
    }
    return () => window.removeEventListener('message', handleMessage);
  }, [DEFAULT_OFFSET]);

  // Adjust position to keep UI on screen
  // Since iframe is positioned at trigger position, UI should be at (0,0) inside iframe
  // But add small offset to avoid cutoff

  // Handle tool click
  const handleToolClick = (toolId) => {
    setLoading(true);
    const execMsg = {
      type: 'PROACTIVE_AI_EXECUTE_TOOL',
      payload: {
        toolId,
        content: fullContent,
        metadata,
        contentTypes
      }
    };
    try {
      window.postMessage(execMsg, '*');
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(execMsg, '*');
      }
    } catch (e) {
      // ignore
    }
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
      <div
        className="proactive-ai-header"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        data-dragging={isDragging ? 'true' : 'false'}
      >
        <div className="proactive-ai-title">
          <span>Proactive Assistant</span>
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
            {metadata?.isOCR && metadata?.ocrConfidence !== undefined && (
              <div className="proactive-ai-context-meta">
                OCR confidence: <strong>{Math.round(metadata.ocrConfidence)}%</strong>
              </div>
            )}
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
                      Download CSV
                    </a>
                  </div>
                )}
              </div>
            )}

            {result.type === 'success' && (
              <div className="proactive-ai-result-success">
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
                {result.equation && (
                  <div className="proactive-ai-result-equation">
                    Plotting: <code>{result.equation}</code>
                  </div>
                )}
                <PlotlyGraph graph={result.graph} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Plotly Graph Component
function PlotlyGraph({ graph }) {
  const graphRef = useRef(null);

  useEffect(() => {
    if (!graphRef.current || !graph || !Array.isArray(graph.traces)) {
      return;
    }

    try {
      Plotly.react(
        graphRef.current,
        graph.traces,
        graph.layout || {},
        {
          displaylogo: false,
          responsive: true
        }
      );
    } catch (error) {
      console.error('Error rendering Plotly preview:', error);
    }

    return () => {
      if (graphRef.current) {
        Plotly.purge(graphRef.current);
      }
    };
  }, [graph]);

  if (!graph || !Array.isArray(graph.traces)) {
    return (
      <div className="proactive-ai-graph-loading">
        <span>Graph data unavailable.</span>
      </div>
    );
  }

  return (
    <div
      ref={graphRef}
      className="proactive-ai-graph-container"
      style={{ width: '100%', height: '260px' }}
    />
  );
}

// Initialize React app
let mountNode =
  document.getElementById('proactive-ai-root') ||
  document.getElementById('root');

if (!mountNode) {
  mountNode = document.createElement('div');
  mountNode.id = 'proactive-ai-root';
  document.body.appendChild(mountNode);
}

ReactDOM.createRoot(mountNode).render(<ProactiveAI />);
