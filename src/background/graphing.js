import { create, all } from 'mathjs';
import { getOpenAIClient, withLatencyMeter } from './openaiClient.js';

const math = create(all);
math.config({ number: 'number', precision: 14 });

export async function graphEquation(equation) {
  const normalizedOriginal = equation ?? '';
  const fallbackEquation = normalizedOriginal.replace(/\\|{|}/g, '').trim();

  try {
    const localResult = tryLocalGraph(normalizedOriginal);
    if (localResult) {
      await persistGraphPayload({
        ...localResult.graphPayload,
        originalEquation: normalizedOriginal
      });

      notifySidePanel(localResult.graphPayload, normalizedOriginal);

      return {
        type: 'graph',
        instruction:
          'Equation graphed locally. View it here or open the side panel for a larger chart.',
        originalEquation: normalizedOriginal,
        equation: localResult.graphPayload.equations.join('; '),
        graph: {
          traces: localResult.graphPayload.traces,
          layout: localResult.graphPayload.layout
        }
      };
    }
  } catch (localError) {
    console.warn('Local graph attempt failed, falling back to AI:', localError);
  }

  try {
    const client = await getOpenAIClient();

    const { normalizedEquations, graphPayload } = await withLatencyMeter(
      'graph-equation-ai',
      async () => {
        const response = await client.responses.create({
          model: 'gpt-5-mini',
          text: {
            format: {
              type: 'json_schema',
              json_schema: {
                name: 'plotly_equations',
                schema: {
                  type: 'object',
                  properties: {
                    equations: {
                      type: 'array',
                      items: { type: 'string' },
                      minItems: 1,
                      maxItems: 4
                    }
                  },
                  required: ['equations'],
                  additionalProperties: false
                }
              }
            }
          },
          input: [
            {
              role: 'system',
              content: [
                {
                  type: 'input_text',
                  text: `You convert mathematical input into explicit functions of x that can be plotted with Plotly.
Rules:
- Return between 1 and 4 equations solved for y using only x, numeric constants, or standard math functions (sin, cos, tan, asin, acos, atan, exp, log, ln, abs, sqrt, sinh, cosh, tanh).
- Replace words, named functions, or parameters (lambda, penalty, ObjectiveFunction, etc.) with numeric constants.
- Use ASCII characters only (use ^ for exponents) and avoid Unicode math symbols.`
                }
              ]
            },
            {
              role: 'user',
              content: [{ type: 'input_text', text: `Convert for Plotly: ${normalizedOriginal}` }]
            }
          ]
        });

        const payload = safeParseJSON(response.output_text);
        const sanitizedEquations = sanitizeEquationText(payload.equations.join('; '));
        const graphPayload = buildPlotlyPayload(sanitizedEquations);

        return {
          normalizedEquations: sanitizedEquations,
          graphPayload
        };
      }
    );

    await persistGraphPayload({
      ...graphPayload,
      originalEquation: normalizedOriginal
    });

    notifySidePanel(graphPayload, normalizedOriginal);

    return {
      type: 'graph',
      instruction: 'Equation graphed. View it here or open the side panel for a larger chart.',
      originalEquation: normalizedOriginal,
      equation: graphPayload.equations.join('; '),
      graph: {
        traces: graphPayload.traces,
        layout: graphPayload.layout
      }
    };
  } catch (error) {
    console.error('Equation parsing error:', error);

    try {
      const fallbackText = sanitizeEquationText(
        fallbackEquation.includes('=') ? fallbackEquation : `y=${fallbackEquation}`
      );
      const graphPayload = buildPlotlyPayload(fallbackText);
      await persistGraphPayload({
        ...graphPayload,
        originalEquation: normalizedOriginal
      });

      notifySidePanel(graphPayload, normalizedOriginal);

      return {
        type: 'graph',
        instruction: 'Showing fallback graph. Review the plot in the side panel.',
        originalEquation: normalizedOriginal,
        equation: graphPayload.equations.join('; '),
        graph: {
          traces: graphPayload.traces,
          layout: graphPayload.layout
        }
      };
    } catch (fallbackError) {
      console.error('Fallback graph generation failed:', fallbackError);
      throw new Error('Unable to generate a graph for the selected equation.');
    }
  }
}

function tryLocalGraph(equation) {
  if (!equation) return null;

  const trimmed = equation.trim();
  if (!/[=^]/.test(trimmed)) {
    return null;
  }

  const candidate = trimmed.includes('=')
    ? trimmed
    : `y=${trimmed.startsWith('y') ? trimmed.slice(1) : trimmed}`;
  const sanitized = sanitizeEquationText(candidate);
  const graphPayload = buildPlotlyPayload(sanitized);
  return { graphPayload };
}

function buildPlotlyPayload(equationText) {
  const parts = equationText
    .split(/[;\n]/)
    .map((eq) => eq.trim())
    .filter(Boolean);

  if (!parts.length) {
    throw new Error('No plottable equations returned.');
  }

  const xValues = generateXValues();
  const traces = [];

  parts.forEach((raw) => {
    const expression = extractExplicitExpression(raw);
    if (!expression) {
      console.warn('Skipping unsupported equation:', raw);
      return;
    }

    try {
      const compiled = math.compile(expression);
      const parameterDefaults = getParameterDefaults(expression);
      const scope = { ...parameterDefaults, x: 0 };
      const yValues = xValues.map((x) => {
        try {
          scope.x = x;
          const value = compiled.evaluate(scope);
          const numeric = extractNumericValue(value);
          return Number.isFinite(numeric) ? Number(numeric) : null;
        } catch {
          return null;
        }
      });

      if (yValues.every((v) => v === null)) {
        console.warn('All values undefined for equation:', raw);
        return;
      }

      traces.push({
        x: [...xValues],
        y: yValues,
        mode: 'lines',
        name: raw,
        hovertemplate: 'x=%{x:.2f}<br>y=%{y:.2f}<extra></extra>'
      });
    } catch (compileError) {
      console.warn('Failed to compile equation:', raw, compileError);
    }
  });

  if (!traces.length) {
    throw new Error('Unable to generate any plot traces from the equation.');
  }

  const layout = {
    title: { text: 'Equation Graph', font: { size: 16 } },
    margin: { t: 40, r: 20, b: 40, l: 50 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    xaxis: { title: 'x', zeroline: true, zerolinecolor: '#ccc' },
    yaxis: { title: 'y', zeroline: true, zerolinecolor: '#ccc' },
    showlegend: traces.length > 1
  };

  return {
    traces,
    layout,
    equations: parts
  };
}

function extractExplicitExpression(raw) {
  if (!raw) return null;
  let expression = raw.trim();

  const explicitRegex = /^(y|f\s*\(\s*x\s*\))\s*=\s*/i;
  if (explicitRegex.test(expression)) {
    return expression.replace(explicitRegex, '').trim();
  }

  if (expression.includes('=')) {
    const [left, right] = expression.split('=').map((part) => part.trim());
    if (/^(y|f\s*\(\s*x\s*\))$/i.test(left)) {
      return right;
    }
    if (/^(y|f\s*\(\s*x\s*\))$/i.test(right)) {
      return left;
    }
    return null;
  }

  return expression;
}

function generateXValues() {
  const points = [];
  const steps = 200;
  const min = -10;
  const max = 10;
  const stepSize = (max - min) / steps;

  for (let i = 0; i <= steps; i++) {
    points.push(Number((min + stepSize * i).toFixed(4)));
  }

  return points;
}

async function persistGraphPayload({ traces, layout, equations, originalEquation }) {
  await chrome.storage.local.set({
    pendingGraph: {
      traces,
      layout,
      equations,
      originalEquation,
      timestamp: Date.now()
    }
  });

  console.log('Graph data saved for side panel');
}

function notifySidePanel(graphPayload, originalEquation) {
  setTimeout(() => {
    chrome.runtime
      .sendMessage({
        action: 'GRAPH_EQUATION',
        graphData: {
          traces: graphPayload.traces,
          layout: graphPayload.layout,
          equations: graphPayload.equations
        },
        originalEquation
      })
      .catch(() => {
        console.log('Side panel not open yet, graph stored for later');
      });
  }, 100);
}

function sanitizeEquationText(text) {
  if (!text) {
    return '';
  }

  let cleaned = String(text)
    .replace(/\r?\n+/g, ';')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/λ/gi, '1')
    .replace(/∑/g, '')
    .replace(/Objective\s*Function\s*=*/gi, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/;+\s*;/g, ';');

  cleaned = cleaned.replace(/\b([a-zA-Z][a-zA-Z0-9_]*)\s*\(\s*x\s*\)/g, (match, name) => {
    const lower = name.toLowerCase();
    return ALLOWED_FUNCTIONS.has(lower) ? `${lower}(x)` : 'x';
  });

  cleaned = cleaned
    .replace(/\bpenalty\d*\b/gi, '1')
    .replace(/\bmargin\d*\b/gi, '1')
    .replace(/\blambda\b/gi, '1')
    .replace(/\bobjective\b/gi, '')
    .replace(/\bfunction\b/gi, '')
    .replace(/1\s*\(\s*x\s*\)/g, 'x');

  return cleaned
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('; ');
}

const ALLOWED_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'exp',
  'log',
  'ln',
  'log10',
  'log2',
  'abs',
  'sqrt',
  'sec',
  'csc',
  'cot'
]);

const ALLOWED_SYMBOLS = new Set(['x', 'pi', 'e', 'tau', 'phi', 'PI', 'E', 'TAU', 'PHI', 'Infinity', 'NaN']);

function getParameterDefaults(expression) {
  try {
    const node = math.parse(expression);
    const params = new Set();
    node.traverse((child) => {
      if (child?.isSymbolNode) {
        params.add(child.name);
      }
    });

    const defaults = {};
    params.forEach((name) => {
      if (ALLOWED_SYMBOLS.has(name) || ALLOWED_FUNCTIONS.has(name.toLowerCase())) {
        return;
      }
      if (typeof math[name] === 'function') {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(math, name) && typeof math[name] === 'number') {
        return;
      }
      defaults[name] = 1;
    });

    return defaults;
  } catch (error) {
    console.warn('Parameter extraction failed:', error);
    return {};
  }
}

function extractNumericValue(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (value && typeof value.re === 'number') {
    return value.re;
  }
  if (value && typeof value.toNumber === 'function') {
    try {
      return value.toNumber();
    } catch {
      return NaN;
    }
  }
  return NaN;
}

function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn('Failed to parse JSON response for graph tool, raw text:', text);
    throw error;
  }
}
