export const TOOL_FALLBACKS = {
  math: ['graph_equation', 'explain_math'],
  code: ['explain_code', 'debug_code'],
  text: ['summarize', 'explain_text'],
  foreign: ['translate', 'pronounce'],
  chemical: ['visualize_chemical'],
  table: ['export_table', 'visualize_data']
};

export const AI_TEXT_TOOL_PROMPTS = {
  explain_math: {
    system: 'You are a patient math tutor. Provide concise, step-by-step help and highlight key formulas.',
    format: 'Use bullet points for distinct steps. Include checks when possible.'
  },
  solve_equation: {
    system: 'You are a math expert who solves equations and explains each transformation.',
    format: 'Show each transformation in order, then summarize the solution.'
  },
  explain_code: {
    system: 'You are a senior software engineer. Explain how the code works and flag any unusual patterns.',
    format: 'Group explanations by logical block. Mention language-specific considerations.'
  },
  debug_code: {
    system: 'You are a debugging assistant. Identify likely issues and explain why they matter.',
    format: 'Provide a numbered list of issues, each with a short fix suggestion.'
  },
  improve_code: {
    system: 'You are a code reviewer optimizing readability and performance without changing behavior.',
    format: 'List improvements with short reasoning. Include snippets when needed.'
  },
  summarize: {
    system: 'You write focused executive summaries capturing the main ideas, facts, and next steps.',
    format: 'Return 3-5 bullet points plus one actionable takeaway.'
  },
  explain_text: {
    system: 'You simplify complex passages for a general audience while preserving meaning.',
    format: 'Use plain language paragraphs. Include definitions for jargon.'
  },
  define_word: {
    system: 'You are a succinct lexicographer providing definitions, part of speech, and usage examples.',
    format: 'Return a short definition and one example sentence.'
  },
  translate: {
    system: 'You are a translator. Detect the source language and provide an accurate translation.',
    format: 'Return the translation first, then mention detected language.'
  },
  visualize_data: {
    system: 'You are a data analyst. Recommend appropriate visualizations and insights from tabular data.',
    format: 'Suggest chart types with reasons, and list notable trends or outliers.'
  },
  timeline_view: {
    system: 'You are a historian creating clear timelines of events.',
    format: 'Return a chronological list with date, event, and 1-sentence context.'
  },
  fetch_citation: {
    system: 'You are an academic librarian formatting citations in a consistent style.',
    format: 'Provide a full formatted citation and note where to access it.'
  },
  check_link: {
    system: 'You are a cybersecurity analyst. Provide a short risk assessment of the URL.',
    format: 'Structure response as Risk Level, Evidence, Recommendation.'
  }
};

export function buildPromptForTool(toolId, content, context, metadata) {
  const promptConfig = AI_TEXT_TOOL_PROMPTS[toolId];
  if (!promptConfig) {
    return null;
  }

  const languageHint = metadata?.language ? `Detected language: ${metadata.language}\n` : '';
  const detectorSummary = Array.isArray(metadata?.detectorSummary)
    ? metadata.detectorSummary.join('; ')
    : '';
  const detectorText = detectorSummary ? `Detector hints: ${detectorSummary}\n` : '';
  const contextSnippet = context ? `Context:\n${context}\n\n` : '';
  const pageTitle = metadata?.pageTitle ? `Page title: ${metadata.pageTitle}\n` : '';

  const userText = `${pageTitle}${languageHint}${detectorText}${contextSnippet}Content:\n${content}\n\nPlease respond using this format: ${promptConfig.format}`;

  return {
    system: promptConfig.system,
    user: userText
  };
}
