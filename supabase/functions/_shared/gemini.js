// Gemini API client (server-side key, paid tier only: free-tier data may be used by Google for training).
// generateJson() returns the parsed JSON object of the first candidate, or throws so the caller can report a clean error.
export function createGeminiClient({ apiKey, model = 'gemini-flash-latest', fetchImpl = globalThis.fetch, timeoutMs = 90000 }) {
  if (!apiKey) throw new Error('gemini: GEMINI_API_KEY is not set');
  return {
    model,
    async generateJson(request) {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
          method: 'POST', signal: ctl.signal,
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(request)
        });
        if (!res.ok) {
          let detail = '';
          try { const j = JSON.parse(await res.text()); const e = j && j.error; if (e) detail = ': ' + [e.status, e.message].filter(Boolean).join(' - ').replace(/\s+/g, ' ').slice(0, 200); } catch { /* not JSON */ }
          throw new Error('gemini http ' + res.status + detail);
        }
        const j = await res.json();
        const cand = j && Array.isArray(j.candidates) ? j.candidates[0] : null;
        const parts = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : [];
        const text = parts.map(p => (p && typeof p.text === 'string' ? p.text : '')).join('');
        if (!text) throw new Error('gemini: empty response' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : ''));
        try { return JSON.parse(text); } catch { throw new Error('gemini: response is not JSON'); }
      } finally { clearTimeout(timer); }
    }
  };
}
