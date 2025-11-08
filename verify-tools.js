/**
 * Verify all 18 tools are properly implemented
 * Run with: node verify-tools.js
 */

const fs = require('fs');

console.log('\n🔍 Verifying All 18 Tools Implementation...\n');

// Read the tool definitions
const toolDefsContent = fs.readFileSync('src/utils/toolDefinitions.js', 'utf8');
const toolIds = [];
const toolDefMatches = toolDefsContent.matchAll(/id:\s*'([^']+)'/g);
for (const match of toolDefMatches) {
  toolIds.push(match[1]);
}

console.log(`📋 Found ${toolIds.length} tool definitions:`);
toolIds.forEach((id, i) => console.log(`   ${i + 1}. ${id}`));

// Read the background worker
const backgroundContent = fs.readFileSync('src/background/index.js', 'utf8');

// Check tool handlers
console.log('\n🔧 Checking tool handlers in background.js...\n');

const missingHandlers = [];
const implementedHandlers = [];

toolIds.forEach(toolId => {
  const handlerPattern = new RegExp(`${toolId}:\\s*\\(`);
  if (handlerPattern.test(backgroundContent)) {
    implementedHandlers.push(toolId);
    console.log(`   ✅ ${toolId}`);
  } else {
    missingHandlers.push(toolId);
    console.log(`   ❌ ${toolId} - MISSING HANDLER`);
  }
});

// Check implementation functions
console.log('\n🔨 Checking implementation functions...\n');

const functions = [
  'graphEquation',
  'explainWithAI',
  'translateText',
  'saveNote',
  'pronounceText',
  'visualizeChemical',
  'createTimeline',
  'exportTableData',
  'visualizeData',
  'fetchCitation',
  'checkLink'
];

functions.forEach(func => {
  const funcPattern = new RegExp(`(async\\s+)?function\\s+${func}|const\\s+${func}\\s*=`);
  if (funcPattern.test(backgroundContent)) {
    console.log(`   ✅ ${func}()`);
  } else {
    console.log(`   ❌ ${func}() - NOT FOUND`);
  }
});

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 Summary');
console.log('='.repeat(60));
console.log(`Total tools defined: ${toolIds.length}`);
console.log(`Handlers implemented: ${implementedHandlers.length}`);
console.log(`Missing handlers: ${missingHandlers.length}`);

if (missingHandlers.length === 0) {
  console.log('\n✅ SUCCESS: All tools are properly implemented!\n');
} else {
  console.log('\n❌ ERROR: Missing handlers for:');
  missingHandlers.forEach(id => console.log(`   - ${id}`));
  console.log('');
}

// Tool categories
console.log('📁 Tool Categories:');
const categories = {
  'Mathematics': ['graph_equation', 'explain_math', 'solve_equation'],
  'Programming': ['explain_code', 'debug_code', 'improve_code'],
  'Language': ['translate', 'pronounce', 'define_word'],
  'Content': ['summarize', 'explain_text', 'save_note'],
  'Specialized': ['visualize_chemical', 'timeline_view', 'export_table', 'visualize_data', 'fetch_citation', 'check_link']
};

for (const [category, tools] of Object.entries(categories)) {
  const implemented = tools.filter(t => implementedHandlers.includes(t)).length;
  const total = tools.length;
  const status = implemented === total ? '✅' : '⚠️';
  console.log(`   ${status} ${category}: ${implemented}/${total} tools`);
}

console.log('\n');

