/**
 * Extension Popup
 * Settings and saved notes interface
 */

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './popup.css';

function Popup() {
  const [activeTab, setActiveTab] = useState('notes');
  const [notes, setNotes] = useState([]);
  const [apiKey, setApiKey] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    // Load notes
    chrome.storage.local.get('notes', ({ notes = [] }) => {
      setNotes(notes);
    });

    // Load API key
    chrome.storage.local.get('apiKey', ({ apiKey = '' }) => {
      setApiKey(apiKey ? '***hidden***' : '');
    });
  }, []);

  const handleDeleteNote = (id) => {
    const updatedNotes = notes.filter(note => note.id !== id);
    chrome.storage.local.set({ notes: updatedNotes });
    setNotes(updatedNotes);
  };

  const handleClearNotes = () => {
    if (confirm('Clear all notes?')) {
      chrome.storage.local.set({ notes: [] });
      setNotes([]);
    }
  };

  const handleSaveApiKey = () => {
    if (apiKey && apiKey !== '***hidden***') {
      chrome.runtime.sendMessage({
        action: 'SET_API_KEY',
        apiKey
      });
      setSavedMessage('API key saved!');
      setTimeout(() => setSavedMessage(''), 3000);
    }
  };

  const handleExportNotes = () => {
    const dataStr = JSON.stringify(notes, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `proactive-ai-notes-${Date.now()}.json`;
    link.click();
  };

  return (
    <div className="popup-container">
      <div className="popup-header">
        <h1>Proactive AI Assistant</h1>
        <p className="popup-subtitle">Context-aware learning companion</p>
      </div>

      <div className="popup-tabs">
        <button
          className={`popup-tab ${activeTab === 'notes' ? 'active' : ''}`}
          onClick={() => setActiveTab('notes')}
        >
          Notes ({notes.length})
        </button>
        <button
          className={`popup-tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      {activeTab === 'notes' && (
        <div className="popup-content">
          {notes.length === 0 ? (
            <div className="popup-empty">
              <p>No saved notes yet.</p>
              <p className="popup-hint">
                Select text on any webpage and use "Save to Notes" to get started!
              </p>
            </div>
          ) : (
            <>
              <div className="popup-actions">
                <button className="popup-button secondary" onClick={handleExportNotes}>
                  Export JSON
                </button>
                <button className="popup-button danger" onClick={handleClearNotes}>
                  Clear All
                </button>
              </div>

              <div className="popup-notes">
                {notes.map(note => (
                  <div key={note.id} className="popup-note">
                    <div className="popup-note-content">{note.content}</div>
                    <div className="popup-note-footer">
                      <span className="popup-note-date">
                        {new Date(note.timestamp).toLocaleString()}
                      </span>
                      <button
                        className="popup-note-delete"
                        onClick={() => handleDeleteNote(note.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="popup-content">
          <div className="popup-setting">
            <label className="popup-label">OpenAI API Key</label>
            <input
              type="password"
              className="popup-input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-proj-..."
            />
            <button className="popup-button primary" onClick={handleSaveApiKey}>
              Save API Key
            </button>
            {savedMessage && (
              <div className="popup-success">{savedMessage}</div>
            )}
            <p className="popup-hint">
              Your API key is stored locally and never sent to our servers.
            </p>
          </div>

          <div className="popup-setting">
            <label className="popup-label">How to Use</label>
            <ol className="popup-instructions">
              <li>Hover over text, math equations, or code snippets</li>
              <li>Select/highlight content for instant AI assistance</li>
              <li>Click suggested tools to get help</li>
              <li>AI automatically detects content type</li>
            </ol>
          </div>

          <div className="popup-setting">
            <label className="popup-label">Features</label>
            <ul className="popup-features">
              <li>Graph mathematical equations</li>
              <li>Explain and debug code</li>
              <li>Translate text</li>
              <li>Summarize content</li>
              <li>Visualize chemistry</li>
              <li>Explore historical timelines</li>
              <li>And much more</li>
            </ul>
          </div>
        </div>
      )}

      <div className="popup-footer">
        <p>Made for curious learners everywhere</p>
        <p className="popup-version">v1.0.0</p>
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<Popup />);
}
