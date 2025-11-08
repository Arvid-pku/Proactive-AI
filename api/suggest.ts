import type { VercelRequest, VercelResponse } from "@vercel/node";

// Minimal heuristic fallback if no LLM is configured
function heuristics(text: string) {
  const isMath = /[=^_\\]|\\frac|\\sum|\\int|sqrt|\d+\s*[+\-*\/^]\s*\d+/.test(text);
  const isCodePy = /\b(def|import|print|class)\b/.test(text);
  const actions = [
    ...(isMath ? [{ id: "math.graph", label: "Graph" }, { id: "math.copy_tex", label: "Copy as TeX" }] : []),
    ...(isCodePy ? [{ id: "code.run_py", label: "Run Python" }, { id: "code.explain", label: "Explain" }] : [{ id: "text.translate", label: "Translate" }, { id: "text.save", label: "Save" }])
  ];
  return { actions, category: isMath ? "math" : isCodePy ? "code.python" : "text", confidence: 0.6 };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method Not Allowed" });
    }
    const { text = "", meta = {} } = (req.body || {});
    const apiKey = process.env.OPENAI_API_KEY;

    // TODO: If apiKey present, call OpenAI for richer suggestions.
    const result = heuristics(String(text || ""));
    return res.status(200).json({ ok: true, ...result, meta });
  } catch (err: any) {
    return res.status(200).json({ ok: true, ...heuristics(""), note: "fallback" });
  }
}
