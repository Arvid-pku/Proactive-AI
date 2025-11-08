/**
 * Side Panel - React Component
 * Complete interface with Graph, Notes, Settings
 */

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import './sidepanel.css';

function SidePanel() {
  const [activeTab, setActiveTab] = useState('graph');
  const [notes, setNotes] = useState([]);
  const [apiKey, setApiKey] = useState('');
  const [savedMessage, setSavedMessage] = useState(false);
  const [currentEquation, setCurrentEquation] = useState(null);
  const graphRef = useRef(null);

  // Load initial data
  useEffect(() => {
    loadNotes();
    loadSettings();
    
    // Check for pending graph when panel opens
    chrome.storage.local.get('pendingGraph', ({ pendingGraph }) => {
      if (pendingGraph && pendingGraph.equation) {
        console.log('✅ Found pending graph:', pendingGraph.equation);
        setActiveTab('graph');
        setCurrentEquation({
          equation: pendingGraph.equation,
          original: pendingGraph.originalEquation
        });
        
        // Clear the pending graph
        chrome.storage.local.remove('pendingGraph');
      }
    });
    
    // Listen for graph requests
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('Side panel received:', request);
      
      if (request.action === 'GRAPH_EQUATION') {
        setActiveTab('graph');
        setCurrentEquation({
          equation: request.equation,
          original: request.originalEquation
        });
        sendResponse({ success: true });
      }
      
      return true;
    });
  }, []);

  // Update iframe when equation changes
  useEffect(() => {
    if (currentEquation && graphRef.current) {
      updateGraph(currentEquation.equation);
    }
  }, [currentEquation]);

  // Update graph in iframe
  const updateGraph = (equation) => {
    if (!graphRef.current) return;

    try {
      console.log('Updating graph for:', equation);
      
      // Build Desmos URL with equation - proper format
      const equations = equation.split(';').map(eq => eq.trim()).filter(eq => eq);
      
      // Build URL with equations as hash parameters (this auto-graphs them!)
      // Format: https://www.desmos.com/calculator/HASH_WITH_EQUATIONS
      // Simple format that works: just add as query param
      const params = equations.map((eq, i) => `expr${i}=${encodeURIComponent(eq)}`).join('&');
      const desmosUrl = `https://www.desmos.com/calculator?${params}`;
      
      console.log('Loading Desmos iframe with URL:', desmosUrl);
      console.log('Equations to graph:', equations);
      
      // Update iframe src
      graphRef.current.src = desmosUrl;
      
      console.log('✅ Graph iframe updated with equation');
      console.log('📊 Desmos should now display:', equations.join(', '));
    } catch (error) {
      console.error('❌ Error updating graph:', error);
    }
  };

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
        <h1>✨ Proactive AI Assistant</h1>
        <p>Context-aware learning companion</p>
      </div>

      <div className="sidepanel-tabs">
        <button
          className={`sidepanel-tab ${activeTab === 'graph' ? 'active' : ''}`}
          onClick={() => setActiveTab('graph')}
        >
          📊 Graph
        </button>
        <button
          className={`sidepanel-tab ${activeTab === 'notes' ? 'active' : ''}`}
          onClick={() => setActiveTab('notes')}
        >
          📝 Notes ({notes.length})
        </button>
        <button
          className={`sidepanel-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ Settings
        </button>
      </div>

      <div className="sidepanel-content">
        {/* Graph Tab */}
        {activeTab === 'graph' && (
          <div className="tab-panel">
            {currentEquation ? (
              <>
                <div className="equation-display">
                  📐 {currentEquation.original || currentEquation.equation}
                </div>
                <iframe
                  ref={graphRef}
                  className="graph-iframe"
                  title="Desmos Graph"
                  frameBorder="0"
                  allow="fullscreen"
                />
              </>
            ) : (
              <div className="placeholder">
                <div className="placeholder-icon">📊</div>
                <h2>Ready to Graph!</h2>
                <p>Select a math equation on any webpage, then click "Graph Equation" to visualize it here.</p>
                <p style={{ marginTop: '12px', fontSize: '13px', color: '#999' }}>
                  Or click the ✨ icon in the bottom-right corner of any page!
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
                Look for the <strong>✨ icon</strong> in the bottom-right corner of webpages to quickly open this panel!
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

