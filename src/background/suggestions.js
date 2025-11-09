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
      return Array.isArray(parsed?.tools) ? parsed.tools : [];
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
  return `You are a helpful assistant that determines which tools would be most useful for selected content.
Available content types: math, code, text, foreign, chemical, historical, table, citation, url, image

Available tools:
- ocr_image: Extract text from images using OCR (for image)
- graph_equation: Graph mathematical equations (for math)
- explain_math: Explain mathematical concepts (for math)
- solve_equation: Solve mathematical equations (for math)
- explain_code: Explain code snippets (for code)
- debug_code: Debug code (for code)
- improve_code: Suggest code improvements (for code)
- translate: Translate text (for text, foreign)
- summarize: Summarize content (for text)
- explain_text: Explain in simpler terms (for text)
- save_note: Save to notes (for any)
- define_word: Dictionary definition (for text)
- visualize_chemical: Show 3D molecular structure (for chemical)
- timeline_view: Historical timeline (for historical)
- export_table: Export data as CSV (for table)
- visualize_data: Create charts (for table)
- fetch_citation: Fetch paper (for citation)
- check_link: Check URL safety (for url)
- pronounce: Text-to-speech (for foreign, text)

Respond with a JSON object containing a "tools" key with an array of tool IDs ordered by relevance.`;
}

function buildUserPrompt({ content, context, contentTypes, metadata }) {
  const summary = Array.isArray(metadata?.detectorSummary) ? metadata.detectorSummary.join('; ') : '';
  const pageTitle = metadata?.pageTitle ? `Page title: ${metadata.pageTitle}\n` : '';
  const language = metadata?.language ? `Detected language: ${metadata.language}\n` : '';

  return `${pageTitle}${language}${summary ? `Detectors: ${summary}\n` : ''}
Content preview:
"${content}"

Context:
"${context}"

Detected types: ${contentTypes.join(', ')}. Return only tool IDs.`;
}

function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn('Failed to parse tool suggestion JSON:', text);
    throw error;
  }
}
