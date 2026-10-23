// Anthropic Messages API client (server-side key). Returns the raw content blocks; throws on any transport/API failure
// so the orchestrator can retry or hand the chat to a human instead of guessing.
export function createAnthropicClient({ apiKey, model = 'claude-haiku-5-5', fetchImpl = globalThis.fetch, timeoutMs = 25000, maxTokens = 700 }) {
  if (!apiKey) throw new Error('llm: ANTHROPIC_API_KEY is not set');
  return {
    async complete({ system, messages, tools }) {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
          method: 'POST', signal: ctl.signal,
          headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.2, system, messages, tools })
        });
        if (!res.ok) {
          // Add Anthropic's error type + message (never the key or the request) so a 400 can be diagnosed from wa_messages.process_error.
          let detail = '';
          try { const j = JSON.parse(await res.text()); const e = j && j.error; if (e) detail = ': ' + [e.type, e.message].filter(Boolean).join(' - ').replace(/\s+/g, ' ').slice(0, 220); } catch { /* body not JSON */ }
          throw new Error('llm http ' + res.status + detail);
        }
        const json = await res.json();
        if (!json || !Array.isArray(json.content)) throw new Error('llm: unexpected response');
        return { content: json.content, stop_reason: json.stop_reason };
      } finally { clearTimeout(timer); }
    }
  };
}
