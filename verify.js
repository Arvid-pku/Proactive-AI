/**
 * Verify project structure and dependencies
 * Run with: node verify.js
 */

const fs = require('fs');
const path = require('path');

console.log('\n🔍 Verifying Proactive AI Assistant Project...\n');

const checks = {
  passed: 0,
  failed: 0,
  warnings: 0
};

function check(condition, message, isWarning = false) {
  if (condition) {
    console.log(`✓ ${message}`);
    checks.passed++;
  } else {
    if (isWarning) {
      console.log(`⚠ ${message}`);
      checks.warnings++;
    } else {
      console.log(`✗ ${message}`);
      checks.failed++;
    }
  }
}

// Check required files
console.log('📁 Checking Files...');

const requiredFiles = [
  'package.json',
  'webpack.config.js',
  'manifest.json',
  'README.md',
  'src/background/index.js',
  'src/content/index.js',
  'src/content/content.css',
  'src/ui/index.jsx',
  'src/ui/ui.html',
  'src/ui/ui.css',
  'src/popup/index.jsx',
  'src/popup/popup.html',
  'src/popup/popup.css',
  'src/utils/contentDetectors.js',
  'src/utils/toolDefinitions.js',
  'src/icons/icon16.png',
  'src/icons/icon48.png',
  'src/icons/icon128.png'
];

requiredFiles.forEach(file => {
  check(fs.existsSync(file), `${file} exists`);
});

// Check package.json
console.log('\n📦 Checking package.json...');

try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  check(pkg.name === 'proactive-ai-assistant', 'Package name is correct');
  check(pkg.dependencies && pkg.dependencies.openai, 'OpenAI dependency exists');
  check(pkg.dependencies && pkg.dependencies.react, 'React dependency exists');
  check(pkg.devDependencies && pkg.devDependencies.webpack, 'Webpack dependency exists');
  check(pkg.scripts && pkg.scripts.build, 'Build script exists');
  check(pkg.scripts && pkg.scripts.dev, 'Dev script exists');
} catch (error) {
  check(false, 'package.json is valid JSON');
}

// Check manifest.json
console.log('\n📋 Checking manifest.json...');

try {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  
  check(manifest.manifest_version === 3, 'Using Manifest V3');
  check(manifest.name === 'Proactive AI Assistant', 'Extension name is correct');
  check(manifest.permissions && manifest.permissions.length > 0, 'Permissions defined');
  check(manifest.background && manifest.background.service_worker, 'Background service worker defined');
  check(manifest.content_scripts && manifest.content_scripts.length > 0, 'Content scripts defined');
} catch (error) {
  check(false, 'manifest.json is valid JSON');
}

// Check node_modules
console.log('\n📚 Checking Dependencies...');

check(fs.existsSync('node_modules'), 'node_modules exists', true);
check(fs.existsSync('node_modules/openai'), 'OpenAI package installed', true);
check(fs.existsSync('node_modules/react'), 'React package installed', true);
check(fs.existsSync('node_modules/webpack'), 'Webpack package installed', true);

// Check dist folder
console.log('\n🏗️ Checking Build Output...');

check(fs.existsSync('dist'), 'dist folder exists', true);
if (fs.existsSync('dist')) {
  check(fs.existsSync('dist/manifest.json'), 'Built manifest.json exists', true);
  check(fs.existsSync('dist/background.js'), 'Built background.js exists', true);
  check(fs.existsSync('dist/content.js'), 'Built content.js exists', true);
  check(fs.existsSync('dist/ui.js'), 'Built ui.js exists', true);
  check(fs.existsSync('dist/popup.js'), 'Built popup.js exists', true);
}

// Check documentation
console.log('\n📖 Checking Documentation...');

const docs = [
  'README.md',
  'INSTALLATION.md',
  'QUICKSTART.md',
  'FEATURES.md',
  'CONTRIBUTING.md',
  'PROJECT_OVERVIEW.md',
  'BUILD_COMPLETE.md'
];

docs.forEach(doc => {
  const exists = fs.existsSync(doc);
  check(exists, `${doc} exists`);
  if (exists) {
    const size = fs.statSync(doc).size;
    check(size > 100, `${doc} has content (${size} bytes)`, true);
  }
});

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 Summary');
console.log('='.repeat(50));
console.log(`✓ Passed: ${checks.passed}`);
console.log(`⚠ Warnings: ${checks.warnings}`);
console.log(`✗ Failed: ${checks.failed}`);
console.log('='.repeat(50));

if (checks.failed === 0) {
  console.log('\n✅ Project structure is valid!');
  
  if (checks.warnings > 0) {
    console.log('\n⚠️ Some warnings found:');
    if (!fs.existsSync('node_modules')) {
      console.log('   - Run "npm install" to install dependencies');
    }
    if (!fs.existsSync('dist')) {
      console.log('   - Run "npm run build" to build the extension');
    }
  } else {
    console.log('\n🎉 Everything looks great!');
    console.log('   Ready to load in Chrome!');
  }
} else {
  console.log('\n❌ Some checks failed. Please review the errors above.');
}

console.log('');

