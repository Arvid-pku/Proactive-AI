import { getOpenAIClient, withLatencyMeter } from './openaiClient.js';
import { TOOL_FALLBACKS } from './toolMetadata.js';

const suggestionCache = new Map();
const CACHE_TTL_MS = 45 * 1000;

export async function getToolSuggestions(request) {
  const {
    content,
    context,
    contentTypes,
    metadata = { pageTitle: '', language: '', detectorSummary: [] }
  } = request;

  const cacheKey = createCacheKey({ content, context, contentTypes, metadata });
  const cached = suggestionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      success: true,
      tools: cached.tools,
      metadata: { cached: true, source: 'memory' },
      timestamp: Date.now()
    };
  }

  try {
    const client = await getOpenAIClient();

    const toolIds = await withLatencyMeter('tool-suggestions', async () => {
      const response = await client.responses.parse({
        model: 'gpt-5-mini',
        text: {
          format: {
            type: 'json_schema',
            name: 'tool_suggestion',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                tools: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 1,
                  maxItems: 4
                }
              },
              required: ['tools'],
              additionalProperties: false
            }
          }
        },
        input: [
          {
            role: 'system',
            content: [
              { type: 'input_text', text: buildSystemPrompt() }
            ]
          },
          {
            role: 'user',
            content: [
              { type: 'input_text', text: buildUserPrompt({ content, context, contentTypes, metadata }) }
            ]
          }
        ]
      });

      // Prefer SDK-parsed output if available, fall back to raw text
      const parsed = response.output_parsed ?? safeParseJSON(response.output_text);
      const base = Array.isArray(parsed?.tools) ? parsed.tools : [];
      return base;
    });

    const trimmedTools = toolIds.slice(0, 4);
    suggestionCache.set(cacheKey, {
      tools: trimmedTools,
      timestamp: Date.now()
    });

    return {
      success: true,
      tools: trimmedTools,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Error getting tool suggestions:', error);

    const tools = contentTypes
      .flatMap((type) => TOOL_FALLBACKS[type] || [])
      .slice(0, 4);

    return {
      success: true,
      tools: tools.length ? tools : ['save_note', 'summarize'],
      fallback: true
    };
  }
}

function createCacheKey(payload) {
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload.content || '').slice(0, 200);
  }
}

function buildSystemPrompt() {
  return `You are an expert tool ranker that selects the best in‑page assistant tools for a user's current selection. Output must obey the JSON schema (only the 'tools' array).

Decision rubric (apply in order):
1) Relevance to the selected text and its immediate context.
2) Specificity: prefer specialized tools over general ones when the selection clearly indicates a specialized task.
3) Clarity of intent: infer likely intent from selection length, structure, entities, and nearby context.
4) Non‑redundancy: avoid choosing tools that substantially overlap in outcome.
5) Confidence: if uncertain, choose fewer tools; add 'save_note' last as a safe fallback.

Signals you receive (may be noisy): detected content types, page title, language hint, nearby DOM context.
Always ground decisions in the actual selection text first, then use signals for tie‑breaks.

Tool catalog (ID → purpose; typical inputs; avoid if…):
- ocr_image → Extract text from images; input is an image; avoid for plain text selections.
- graph_equation → Plot explicit functions/expressions (e.g., y=f(x)); avoid for prose math or pure arithmetic.
- explain_math → Explain math ideas/derivations; avoid when the user likely wants a numeric solution.
- solve_equation → Solve algebraic equations; avoid when no equation is present.
- explain_code → Understand code behavior, I/O, control flow, complexity; avoid if the text is non‑code.
- debug_code → Likely bugs or error symptoms in code; avoid if no defect is implied.
- improve_code → Refactor/optimize/clean up code; avoid if code is trivial or intent unknown.
- translate → Convert between languages; avoid if selection already matches page language and no translation is implied.
- pronounce → Short foreign words/phrases where pronunciation helps; avoid for long passages.
- summarize → Condense long passages; avoid for tiny or atomic selections.
- explain_text → Simplify dense prose; avoid for very short selections.
- define_word → Single terms or short phrases; avoid for multi‑sentence content.
- visualize_chemical → Show molecular structures for formulas/compounds; avoid for non‑chemistry text.
- timeline_view → Chronological narratives or multi‑event histories; avoid for single dates without context.
- export_table → Table‑like selections to CSV; avoid if not tabular data.
- visualize_data → Charts for numeric tables; avoid if no numeric structure.
- fetch_citation → Citations/DOIs/arXiv references; avoid for non‑reference text.
- check_link → URL risk/preview; avoid if no URL present.
- save_note → General capture when nothing else clearly fits.

Return up to 4 tool IDs, ordered by usefulness. Only use IDs from the catalog.`;
}

function buildUserPrompt({ content, context, contentTypes, metadata }) {
  const summary = Array.isArray(metadata?.detectorSummary) ? metadata.detectorSummary.join('; ') : '';
  const pageTitle = metadata?.pageTitle ? `Page title: ${metadata.pageTitle}\n` : '';
  const language = metadata?.language ? `Language hint: ${metadata.language}\n` : '';
  const elementTag = metadata?.elementTag ? `Element tag: ${metadata.elementTag}\n` : '';
  const elementLang = metadata?.elementLanguage ? `Element lang attribute: ${metadata.elementLanguage}\n` : '';
  const snapshot = metadata?.elementSnapshot ? `Element HTML snippet (trimmed):\n${metadata.elementSnapshot}\n\n` : '';
  const types = Array.isArray(contentTypes) && contentTypes.length ? contentTypes.join(', ') : 'none';

  const selection = String(content || '');
  const ctx = String(context || '');
  const wordCount = selection.trim().split(/\s+/).filter(Boolean).length;
  const charCount = selection.length;
  const ctxCharCount = ctx.length;

  return `${pageTitle}${language}${elementTag}${elementLang}${summary ? `Analysis summary: ${summary}\n` : ''}${snapshot}Selection (trimmed):\n${selection}
\nSelection stats: ~${charCount} chars, ~${wordCount} words
\nNearby context (trimmed):\n${ctx}
\nContext stats: ~${ctxCharCount} chars
\nDetected types (legacy signal, may be empty): ${types}. Rank up to 4 tool IDs by usefulness for this selection and context.`;
}

function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn('Failed to parse tool suggestion JSON:', text);
    throw error;
  }
}

// (No post-processing heuristics; rely on robust prompts)
