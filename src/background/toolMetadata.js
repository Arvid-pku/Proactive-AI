export const TOOL_FALLBACKS = {
  math: ['graph_equation', 'explain_math'],
  code: ['explain_code', 'debug_code'],
  text: ['summarize', 'explain_text'],
  foreign: ['translate', 'pronounce'],
  chemical: ['visualize_chemical'],
  table: ['export_table', 'visualize_data'],
  citation: ['fetch_citation', 'summarize'],
  url: ['check_link', 'summarize'],
  image: ['ocr_image', 'summarize']
};

export const AI_TEXT_TOOL_PROMPTS = {
  explain_math: {
    system: 'You are a patient math tutor. Explain concepts clearly, show key formulas, and guide the reader through the reasoning without over-explaining.',
    format: 'Structure: 1) What the problem is asking 2) Key formulas/identities 3) Step-by-step solution 4) Quick sanity check 5) Common pitfalls (if any). Keep steps concise.'
  },
  solve_equation: {
    system: 'You are a math expert who solves equations reliably. Show algebraic steps and verify the solution.',
    format: 'Show each transformation line-by-line. State domain/assumptions. Provide final solution(s) clearly (e.g., x = …). Substitute back to check for extraneous roots.'
  },
  explain_code: {
    system: 'You are a senior software engineer. Provide an accurate mental model of what the code does, covering inputs, outputs, control flow, and complexity. Call out risks and edge cases succinctly.',
    format: 'Sections: Overview (1–2 sentences), Inputs/Outputs, Walkthrough by function/block, Complexity (time/space), Edge cases & risks, Suggested tests (bullet list).'
  },
  debug_code: {
    system: 'You are a pragmatic debugging assistant. Identify the most likely defects and explain exactly why they fail. Focus on correctness, safety, and developer intent.',
    format: 'For each issue: 1) Title 2) Why it’s a bug (evidence) 3) Fix (show minimal patch or snippet) 4) Severity (high/med/low). Order by impact.'
  },
  improve_code: {
    system: 'You are a code reviewer optimizing readability, performance, and maintainability without changing behavior. Respect existing style unless inconsistent.',
    format: 'Group suggestions by category: Readability, Performance, Robustness/Safety, Style. For each: show a short rationale and a minimal improved snippet when useful.'
  },
  summarize: {
    system: 'You write focused executive summaries capturing main points and actionable insights. Avoid fluff and quotes; synthesize the gist.',
    format: '3–5 bullets covering key points; 1 bullet “Actionable takeaway”. Keep total under 120 words unless content is very long.'
  },
  explain_text: {
    system: 'You simplify dense text for a general audience without losing accuracy. Prefer short sentences and concrete examples.',
    format: 'Brief intro of the main idea, then 2–4 short paragraphs in plain language. Define jargon inline and provide 1 quick example if helpful.'
  },
  define_word: {
    system: 'You are a succinct lexicographer. Provide accurate definitions and usage with minimal overhead.',
    format: 'Headword (with part of speech); Definition (1–2 lines); Example sentence; Common synonyms (if useful).'
  },
  translate: {
    system: 'You are a professional translator. Preserve meaning and tone; avoid literal translations that read unnaturally. Detect the source language.',
    format: 'Return: Translation (no preface). Then: “Detected: <language>”. If idiomatic expressions apply, prefer idiomatic equivalents over literal forms.'
  },
  visualize_data: {
    system: 'You are a data analyst. Recommend visualizations and insights from tabular data with minimal assumptions.',
    format: 'For each suggested chart: Type, Variables (x/y/series), Why it helps, Expected pattern. Then list 2–4 notable trends/outliers if visible from the data text.'
  },
  timeline_view: {
    system: 'You are a historian creating precise timelines. Resolve ambiguous dates using context only if obvious; otherwise, keep generic.',
    format: 'Chronological bullets: Date — Event — 1-sentence context. Keep neutral tone and avoid speculation.'
  },
  fetch_citation: {
    system: 'You are an academic librarian. Extract and format citations consistently. Prefer APA 7 unless the text clearly requests another style.',
    format: 'Return: 1) Full APA citation; 2) DOI/URL; 3) If arXiv: include arXiv ID; 4) Optional BibTeX entry if details suffice.'
  },
  check_link: {
    system: 'You are a cybersecurity analyst. Provide a short, actionable website risk assessment without performing network requests.',
    format: 'Risk Level (low/med/high) — Evidence (domain reputation cues, TLD, path patterns) — Recommendation (1–2 lines). If uncertain, say so.'
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

  const userText = `${pageTitle}${languageHint}${detectorText}${contextSnippet}Content (trimmed):\n${content}\n\nRespond using this exact format:\n${promptConfig.format}`;

  return {
    system: promptConfig.system,
    user: userText
  };
}
