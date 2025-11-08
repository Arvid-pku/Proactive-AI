/**
 * Side Panel - React Component
 * Complete interface with Graph, Notes, Settings
 */

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import Plotly from 'plotly.js-dist-min';
import './sidepanel.css';

function SidePanel() {
  const [activeTab, setActiveTab] = useState('graph');
  const [notes, setNotes] = useState([]);
  const [apiKey, setApiKey] = useState('');
  const [savedMessage, setSavedMessage] = useState(false);
  const [currentGraph, setCurrentGraph] = useState(null);
  const graphRef = useRef(null);

  // Load initial data
  useEffect(() => {
    loadNotes();
    loadSettings();
    
    // Check for pending graph when panel opens
    chrome.storage.local.get('pendingGraph', ({ pendingGraph }) => {
      if (pendingGraph && pendingGraph.traces) {
        console.log('Found pending graph data');
        setActiveTab('graph');
        setCurrentGraph(pendingGraph);
        
        // Clear the pending graph
        chrome.storage.local.remove('pendingGraph');
      }
    });
    
    // Listen for graph requests
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('Side panel received:', request);
      
      if (request.action === 'GRAPH_EQUATION') {
        setActiveTab('graph');
        setCurrentGraph({
          traces: request.graphData?.traces || [],
          layout: request.graphData?.layout || {},
          equations: request.graphData?.equations || [],
          originalEquation: request.originalEquation,
          timestamp: Date.now()
        });
        sendResponse({ success: true });
      }
      
      return true;
    });
  }, []);

  useEffect(() => {
    if (!graphRef.current || !currentGraph) return;

    try {
      Plotly.react(
        graphRef.current,
        currentGraph.traces || [],
        currentGraph.layout || {},
        {
          displaylogo: false,
          responsive: true
        }
      );

      console.log('Plotly graph rendered');
    } catch (error) {
      console.error('Error rendering Plotly graph:', error);
    }

    return () => {
      if (graphRef.current) {
        Plotly.purge(graphRef.current);
      }
    };
  }, [currentGraph]);

  const loadNotes = () => {
    chrome.storage.local.get('notes', ({ notes = [] }) => {
      setNotes(notes);
    });
  };

  const loadSettings = () => {
    chrome.storage.local.get('apiKey', ({ apiKey = '' }) => {
      setApiKey(apiKey ? '***hidden***' : '');
    });
  };

  const handleSaveApiKey = () => {
    if (apiKey && apiKey !== '***hidden***') {
      chrome.runtime.sendMessage({
        action: 'SET_API_KEY',
        apiKey
      });
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 3000);
    }
  };

  const handleDeleteNote = (id) => {
    const updated = notes.filter(note => note.id !== id);
    chrome.storage.local.set({ notes: updated }, () => {
      setNotes(updated);
    });
  };

  return (
    <div className="sidepanel-container">
      <div className="sidepanel-header">
        <h1>Proactive AI Assistant</h1>
        <p>Context-aware learning companion</p>
      </div>

      <div className="sidepanel-tabs">
        <button
          className={`sidepanel-tab ${activeTab === 'graph' ? 'active' : ''}`}
          onClick={() => setActiveTab('graph')}
        >
          Graph
        </button>
        <button
          className={`sidepanel-tab ${activeTab === 'notes' ? 'active' : ''}`}
          onClick={() => setActiveTab('notes')}
        >
          Notes ({notes.length})
        </button>
        <button
          className={`sidepanel-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      <div className="sidepanel-content">
        {/* Graph Tab */}
        {activeTab === 'graph' && (
          <div className="tab-panel">
            {currentGraph ? (
              <>
                <div className="equation-display">
                  {currentGraph.originalEquation || currentGraph.equations?.join('; ')}
                </div>
                {currentGraph.equations?.length > 0 && (
                  <div className="equation-display" style={{ fontSize: '13px', opacity: 0.75 }}>
                    Plotting: {currentGraph.equations.join('; ')}
                  </div>
                )}
                <div
                  ref={graphRef}
                  className="graph-iframe"
                  title="Plotly Graph"
                />
              </>
            ) : (
              <div className="placeholder">
                <h2>Ready to Graph</h2>
                <p>Select a math equation on any webpage, then click "Graph Equation" to visualize it here.</p>
                <p style={{ marginTop: '12px', fontSize: '13px', color: '#999' }}>
                  Use the assistant button in the lower right corner of any page to open this panel quickly.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Notes Tab */}
        {activeTab === 'notes' && (
          <div className="tab-panel">
            {notes.length === 0 ? (
              <div className="placeholder">
                <p>No saved notes yet.</p>
                <p style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
                  Select text and use "Save to Notes" to get started!
                </p>
              </div>
            ) : (
              <div>
                {notes.map(note => (
                  <div key={note.id} className="note-item">
                    <div className="note-content">{note.content}</div>
                    <div className="note-footer">
                      <span>{new Date(note.timestamp).toLocaleString()}</span>
                      <button
                        className="note-delete"
                        onClick={() => handleDeleteNote(note.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="tab-panel">
            <div className="setting-block">
              <label className="setting-label">OpenAI API Key</label>
              <input
                type="password"
                className="setting-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-proj-..."
              />
              <button className="setting-button" onClick={handleSaveApiKey}>
                Save API Key
              </button>
              {savedMessage && (
                <div className="success-message">API key saved!</div>
              )}
            </div>

            <div className="setting-block">
              <label className="setting-label">How to Use</label>
              <ol style={{ fontSize: '13px', lineHeight: '1.8', color: '#555', paddingLeft: '20px' }}>
                <li>Hover over or select text, equations, code</li>
                <li>Click suggested tools in the floating assistant</li>
                <li>View results instantly</li>
                <li>Graphs appear in this panel!</li>
              </ol>
            </div>

            <div className="setting-block">
              <label className="setting-label">Quick Access</label>
              <p style={{ fontSize: '13px', color: '#555', lineHeight: '1.6' }}>
                Use the assistant button in the bottom-right corner of webpages to open this panel instantly.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<SidePanel />);
}
