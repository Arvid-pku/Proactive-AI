import { getOpenAIClient, withLatencyMeter } from './openaiClient.js';
import { graphEquation } from './graphing.js';
import { buildPromptForTool } from './toolMetadata.js';

export async function executeTool({ toolId, content, context, metadata = {}, contentTypes = [] }) {
  console.log('Executing tool:', toolId, 'content length:', content?.length);

  const handlers = {
    ocr_image: () => handleOCRImage(content),
    graph_equation: () => graphEquation(content),
    explain_math: () => runAIPrompt('explain_math', content, context, metadata),
    solve_equation: () => runAIPrompt('solve_equation', content, context, metadata),
    explain_code: () => runAIPrompt('explain_code', content, context, metadata),
    debug_code: () => runAIPrompt('debug_code', content, context, metadata),
    improve_code: () => runAIPrompt('improve_code', content, context, metadata),
    translate: () => runAIPrompt('translate', content, context, metadata),
    summarize: () => runAIPrompt('summarize', content, context, metadata),
    explain_text: () => runAIPrompt('explain_text', content, context, metadata),
    save_note: () => saveNote(content),
    define_word: () => runAIPrompt('define_word', content, context, metadata),
    pronounce: () => pronounceText(content, metadata),
    visualize_chemical: () => visualizeChemical(content),
    timeline_view: () => runAIPrompt('timeline_view', content, context, metadata),
    export_table: () => exportTableData(content, context),
    visualize_data: () => runAIPrompt('visualize_data', content, context, metadata),
    fetch_citation: () => fetchCitation(content, context, metadata),
    check_link: () => checkLink(content)
  };

  const handler = handlers[toolId];
  if (!handler) {
    console.error('Unknown tool:', toolId);
    return { success: false, error: 'Unknown tool: ' + toolId };
  }

  try {
    const result = await handler();
    return { success: true, result };
  } catch (error) {
    console.error('Error executing tool:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while executing the tool'
    };
  }
}

function handleOCRImage(text) {
  return {
    type: 'text',
    content: `Extracted text from image:\n\n${text}\n\nYou can now use other tools on this text.`,
    extractedText: text
  };
}

async function runAIPrompt(toolId, content, context, metadata) {
  const prompt = buildPromptForTool(toolId, content, context, metadata);
  if (!prompt) {
    throw new Error('No prompt configuration for tool: ' + toolId);
  }

  const client = await getOpenAIClient();
  const response = await withLatencyMeter(`tool-${toolId}`, async () =>
    client.responses.create({
      model: 'gpt-5-mini',
      input: [
        { role: 'system', content: [{ type: 'input_text', text: prompt.system }] },
        { role: 'user', content: [{ type: 'input_text', text: prompt.user }] }
      ]
    })
  );

  return {
    type: 'text',
    content: response.output_text
  };
}

function saveNote(content) {
  const timestamp = new Date().toISOString();

  return chrome.storage.local.get('notes').then(({ notes = [] }) => {
    notes.unshift({
      content,
      timestamp,
      id: Date.now()
    });

    return chrome.storage.local.set({ notes }).then(() => ({
      type: 'success',
      message: 'Saved to notes!',
      count: notes.length
    }));
  });
}

function pronounceText(text, metadata) {
  const language = metadata?.language || 'en-US';
  return {
    type: 'audio',
    text,
    voice: language,
    instruction: 'Use browser text-to-speech'
  };
}

function visualizeChemical(formula) {
  const cleaned = formula.trim().replace(/\s+/g, '');
  const pubchemUrl = `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(cleaned)}`;

  return {
    type: 'url',
    url: pubchemUrl,
    formula: cleaned,
    instruction: 'Opening PubChem to visualize the molecular structure. Search for your compound to see 3D structure.'
  };
}

function exportTableData(content) {
  try {
    const lines = content.split('\n').filter((line) => line.trim());

    const csv = lines
      .map((line) => line.trim().replace(/\s{2,}|\t+/g, ','))
      .join('\n');

    const blob = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;

    return {
      type: 'text',
      content: `Table data ready to export:\n\n${csv}\n\nTo download: Right-click and "Save link as" on the download button in your browser.`,
      csvData: csv,
      downloadUrl: blob
    };
  } catch (error) {
    console.error('Export error:', error);
    return {
      type: 'text',
      content: 'Could not parse table data. Please select a properly formatted table.'
    };
  }
}

async function fetchCitation(content, context, metadata) {
  const client = await getOpenAIClient();
  const doiMatch = content.match(/10\.\d{4,}\/[^\s]+/);
  const arxivMatch = content.match(/arXiv:(\d+\.\d+)/i);

  let url = null;
  if (doiMatch) {
    url = `https://doi.org/${doiMatch[0]}`;
  } else if (arxivMatch) {
    url = `https://arxiv.org/abs/${arxivMatch[1]}`;
  }

  const prompt = buildPromptForTool('fetch_citation', content, context || metadata?.contextSnippet || '', metadata);
  const system = prompt?.system || 'You are an academic librarian.';
  const user = prompt?.user || `Extract and format citation from this text:\n${content}`;

  const response = await withLatencyMeter('tool-fetch_citation', async () =>
    client.responses.create({
      model: 'gpt-5-mini',
      input: [
        { role: 'system', content: [{ type: 'input_text', text: system }] },
        { role: 'user', content: [{ type: 'input_text', text: user }] }
      ]
    })
  );

  const citation = response.output_text;

  if (url) {
    return {
      type: 'url',
      url,
      citation,
      instruction: 'Click to open the paper. Citation details above.'
    };
  }

  return {
    type: 'text',
    content: citation
  };
}

async function checkLink(url) {
  const client = await getOpenAIClient();

  const urlMatch = url.match(/https?:\/\/[^\s]+/);
  const actualUrl = urlMatch ? urlMatch[0] : url;

  let domain = 'unknown';
  try {
    const urlObj = new URL(actualUrl);
    domain = urlObj.hostname;
  } catch (e) {
    domain = 'Invalid URL';
  }

  const prompt = buildPromptForTool('check_link', actualUrl, '', { domain });
  const system = prompt?.system || 'You are a cybersecurity expert.';
  const user =
    prompt?.user ||
    `Evaluate the safety of this URL and provide recommendations:\n${actualUrl}\nDomain: ${domain}`;

  const response = await withLatencyMeter('tool-check_link', async () =>
    client.responses.create({
      model: 'gpt-5-mini',
      input: [
        { role: 'system', content: [{ type: 'input_text', text: system }] },
        { role: 'user', content: [{ type: 'input_text', text: user }] }
      ]
    })
  );

  return {
    type: 'text',
    content: `Domain: ${domain}\n\n${response.output_text}\n\nStay cautious when clicking unknown links.`
  };
}
