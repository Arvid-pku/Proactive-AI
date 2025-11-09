import { create, all } from 'mathjs';
import { getOpenAIClient, withLatencyMeter } from './openaiClient.js';

const math = create(all);
math.config({ number: 'number', precision: 14 });

export async function graphEquation(equation) {
  const normalizedOriginal = equation ?? '';
  const fallbackEquation = normalizedOriginal.replace(/\\|{|}/g, '').trim();
  console.log('[Graphing] Request received', {
    length: normalizedOriginal.length,
    preview: normalizedOriginal.slice(0, 120)
  });

  try {
    const client = await getOpenAIClient();

    const graphPayload = await withLatencyMeter('graph-equation-ai', async () => {
      const response = await client.responses.create({
        model: 'gpt-5-mini',
        text: {
          format: {
            type: 'json_schema',
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
        },
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: `You convert mathematical text (often messy OCR) into explicit functions of x that can be plotted with Plotly.

Output format:
- Return 1–4 equations, each on its own line, in the form: y = <expression in x and numeric constants only>
- Use ASCII only (^ for powers). Allowed functions: sin, cos, tan, asin, acos, atan, exp, log, ln, abs, sqrt, sinh, cosh, tanh.
- Replace words/named symbols/parameters (lambda, penalty, ObjectiveFunction, a, b, c, θ, β, etc.) with numeric constants (choose small integers like 1–5 as needed).

Normalization & repair rules:
1. Whitespace & symbols
   - Collapse repeated spaces; convert Unicode minus to -; convert × or · to *.
   - Convert Unicode superscripts to ^ (e.g., x² → x^2).
   - Normalize ln/log usage.
2. Parentheses inference
   - When ambiguous forms like "1+e −z 1" appear, assume conventional fraction 1/(1+e^-z).
   - Add missing parentheses in exponents: e^-x+1 → e^(-x)+1.
3. Greek & named functions
   - σ(...), sigmoid(...), logistic(...) → 1/(1+exp(-(...))).
4. Fractions
   - Fix stacked or reversed OCR fractions: 1+e −z 1 → 1/(1+e^(-z)).
5. Variable binding
   - Replace any variable (z, t, u, etc.) with x.
6. Constants
   - Replace named constants/parameters with integers 1–5; keep e as base of natural exponent.
7. Solve for y
   - If the left side is f(x), σ(x), etc., rewrite as y = ...

Canonical patterns:
- Sigmoid/logistic: σ(x), sigmoid(x), 1/(1+e^{-x}), 1/(1+exp(-x))
- Softplus: ln(1+e^x)
- Logit: ln(p/(1-p))
- Common OCR slips: 1+e −x 1 → 1/(1+e^(-x)); sqrt x → sqrt(x)

Examples:
Input: σ(z)= 1+e −z 1
Output: y = 1/(1+exp(-x))

Input: f(t) = ln(1 + e t )
Output: y = ln(1+exp(x))

Input: ObjectiveFunction(x) = logistic( 3x-2 )
Output: y = 1/(1+exp(-(3*x-2)))

Input: p = 2x + a; σ(p)
Output: y = 1/(1+exp(-(2*x+2)))

Input: cos θ + sin θ
Output: y = cos(x) + sin(x)

`
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
      console.log('[Graphing] AI normalized equations', {
        count: payload.equations?.length ?? 0,
        equations: payload.equations
      });
      const combined = Array.isArray(payload.equations)
        ? payload.equations.join('; ')
        : String(payload.equations ?? '');
      return buildPlotlyPayload(combined);
    });

    await persistGraphPayload({
      ...graphPayload,
      originalEquation: normalizedOriginal
    });

    notifySidePanel(graphPayload, normalizedOriginal);
    console.log('[Graphing] Graph payload stored and notification sent', {
      traces: graphPayload.traces.length
    });

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
    console.log('[Graphing] Falling back to sanitized local attempt');

    try {
      const fallbackText = sanitizeEquationText(
        fallbackEquation.includes('=') ? fallbackEquation : `y=${fallbackEquation}`
      );
      console.log('[Graphing] Fallback equations', { fallbackText });
      const graphPayload = buildPlotlyPayload(fallbackText);
      await persistGraphPayload({
        ...graphPayload,
        originalEquation: normalizedOriginal
      });

      notifySidePanel(graphPayload, normalizedOriginal);
      console.log('[Graphing] Fallback graph stored', {
        traces: graphPayload.traces.length
      });

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
