/**
 * Tool Definitions - Available helper tools
 */

export const TOOL_DEFINITIONS = [
  {
    id: 'ocr_image',
    name: 'Extract Text (OCR)',
    description: 'Extract text from image',
    contentTypes: ['image'],
    action: 'OCR_IMAGE'
  },
  {
    id: 'graph_equation',
    name: 'Graph Equation',
    description: 'Visualize mathematical equation using Plotly.js',
    contentTypes: ['math'],
    action: 'GRAPH_EQUATION'
  },
  {
    id: 'explain_math',
    name: 'Explain Math',
    description: 'Get step-by-step explanation',
    contentTypes: ['math'],
    action: 'EXPLAIN_MATH'
  },
  {
    id: 'solve_equation',
    name: 'Solve Equation',
    description: 'Find solutions to the equation',
    contentTypes: ['math'],
    action: 'SOLVE_EQUATION'
  },
  {
    id: 'explain_code',
    name: 'Explain Code',
    description: 'Understand what this code does',
    contentTypes: ['code'],
    action: 'EXPLAIN_CODE'
  },
  {
    id: 'debug_code',
    name: 'Debug Code',
    description: 'Find and fix potential issues',
    contentTypes: ['code'],
    action: 'DEBUG_CODE'
  },
  {
    id: 'improve_code',
    name: 'Improve Code',
    description: 'Suggest optimizations',
    contentTypes: ['code'],
    action: 'IMPROVE_CODE'
  },
  {
    id: 'translate',
    name: 'Translate',
    description: 'Translate to other languages',
    contentTypes: ['text', 'foreign'],
    action: 'TRANSLATE'
  },
  {
    id: 'summarize',
    name: 'Summarize',
    description: 'Get a concise summary',
    contentTypes: ['text'],
    action: 'SUMMARIZE'
  },
  {
    id: 'explain_text',
    name: 'Explain',
    description: 'Explain in simpler terms',
    contentTypes: ['text'],
    action: 'EXPLAIN_TEXT'
  },
  {
    id: 'save_note',
    name: 'Save to Notes',
    description: 'Save for later reference',
    contentTypes: ['text', 'math', 'code'],
    action: 'SAVE_NOTE'
  },
  {
    id: 'define_word',
    name: 'Define',
    description: 'Get dictionary definition',
    contentTypes: ['text'],
    action: 'DEFINE_WORD'
  },
  {
    id: 'visualize_chemical',
    name: '3D Structure',
    description: 'View molecular structure',
    contentTypes: ['chemical'],
    action: 'VISUALIZE_CHEMICAL'
  },
  {
    id: 'timeline_view',
    name: 'Timeline',
    description: 'View in historical context',
    contentTypes: ['historical'],
    action: 'TIMELINE_VIEW'
  },
  {
    id: 'export_table',
    name: 'Export Data',
    description: 'Export as CSV/Excel',
    contentTypes: ['table'],
    action: 'EXPORT_TABLE'
  },
  {
    id: 'visualize_data',
    name: 'Visualize Data',
    description: 'Create charts from data',
    contentTypes: ['table'],
    action: 'VISUALIZE_DATA'
  },
  {
    id: 'fetch_citation',
    name: 'Get Paper',
    description: 'Fetch full reference',
    contentTypes: ['citation'],
    action: 'FETCH_CITATION'
  },
  {
    id: 'check_link',
    name: 'Check Link',
    description: 'Preview and verify safety',
    contentTypes: ['url'],
    action: 'CHECK_LINK'
  },
  {
    id: 'pronounce',
    name: 'Pronounce',
    description: 'Hear pronunciation',
    contentTypes: ['foreign', 'text'],
    action: 'PRONOUNCE'
  }
];

// Get tools for specific content types
export function getToolsForContent(contentTypes) {
  return TOOL_DEFINITIONS.filter(tool => 
    tool.contentTypes.some(type => contentTypes.includes(type))
  );
}

// Get tool by ID
export function getToolById(id) {
  return TOOL_DEFINITIONS.find(tool => tool.id === id);
}
