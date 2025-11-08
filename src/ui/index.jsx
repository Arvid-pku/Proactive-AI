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
          </div>
        </div>
      )}
    </div>
  );
}

// Initialize React app
const root = document.getElementById('proactive-ai-root');
if (root) {
  ReactDOM.createRoot(root).render(<ProactiveAI />);
}

