/**
 * Floating UI Component
 * React-based interface for displaying tools and results
 */

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import './ui.css';
import { TOOL_DEFINITIONS } from '../utils/toolDefinitions.js';
import Plotly from 'plotly.js-dist-min';

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
  
  const containerRef = useRef(null);

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
const root = document.getElementById('proactive-ai-root');
if (root) {
  ReactDOM.createRoot(root).render(<ProactiveAI />);
}
