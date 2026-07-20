const MODEL = "@cf/moondream/moondream3.1-9B-A2B";

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true, service: "CardScan AI", model: MODEL }, 200, cors);
    }
    if (url.pathname !== "/identify" || request.method !== "POST") {
      return json({ error: "Not found" }, 404, cors);
    }

    if (env.SCANNER_KEY) {
      const supplied = request.headers.get("x-scanner-key") || "";
      if (supplied !== env.SCANNER_KEY) return json({ error: "Unauthorized" }, 401, cors);
    }

    try {
      const body = await request.json();
      const image = String(body.image || "");
      const language = body.language === "en" ? "English" : "German";
      if (!image.startsWith("data:image/")) return json({ error: "Missing image data URI" }, 400, cors);
      if (image.length > 4_500_000) return json({ error: "Image too large" }, 413, cors);

      const question = `Identify the exact Pokémon Trading Card Game card shown in the image. The printed card language is ${language}. Read the collector number from the bottom of the card and preserve card suffixes such as ex, EX, GX, V, VMAX, VSTAR and Mega. Do not identify the illustrated Pokémon only; identify the exact printed card. Return ONLY compact valid JSON with this schema: {"name":"exact printed card name","number":"collector number before slash","denominator":"number after slash or empty","setCode":"printed set code or empty","language":"de or en","confidence":0.0,"notes":"very short uncertainty note"}. If uncertain, still provide the best visible reading and lower confidence. Never include Markdown.`;

      const result = await env.AI.run(MODEL, {
        task: "query",
        image,
        question,
        reasoning: false,
        temperature: 0,
        top_p: 0.1,
        max_tokens: 420,
        stream: false
      });

      const answer = String(result?.answer || result?.response || "").trim();
      const parsed = parseJsonAnswer(answer);
      if (!parsed) return json({ error: "Model returned no valid JSON", raw: answer.slice(0, 1200) }, 502, cors);

      return json(normalizeResult(parsed), 200, cors);
    } catch (error) {
      return json({ error: "Identification failed", detail: String(error?.message || error) }, 500, cors);
    }
  }
};

function parseJsonAnswer(answer) {
  try { return JSON.parse(answer); } catch {}
  const match = answer.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function normalizeResult(value) {
  const number = String(value.number || "").replace(/[^0-9A-Za-z]/g, "").slice(0, 10);
  const denominator = String(value.denominator || "").replace(/\D/g, "").slice(0, 4);
  return {
    name: String(value.name || "").trim().slice(0, 80),
    number,
    denominator,
    setCode: String(value.setCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8),
    language: value.language === "en" ? "en" : "de",
    confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
    notes: String(value.notes || "").trim().slice(0, 180)
  };
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "*";
  const allowed = String(env.ALLOWED_ORIGIN || "*");
  const allowOrigin = allowed === "*" || origin === allowed ? origin : allowed;
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "POST, OPTIONS, GET",
    "access-control-allow-headers": "content-type, x-scanner-key",
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
