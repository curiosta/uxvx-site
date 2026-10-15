// LLM provider request builders for the site demo. Only the selected text is ever sent.
(function (root) {
  const PRESETS = {
    xai: { baseUrl: 'https://api.x.ai/v1', model: 'grok-4-fast-non-reasoning', needsKey: true },
    openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', needsKey: true }
  };
  const MAX_CHARS = 4000;

  function prompt(text, level) {
    return [
      { role: 'system', content: `You are a patient tutor. Explain the passage simply for a ${level || 'curious beginner'} in under 120 words, then give one short analogy. Plain text.` },
      { role: 'user', content: String(text).slice(0, MAX_CHARS) }
    ];
  }

  function buildRequest(settings, text) {
    const p = settings.provider || 'xai';
    const preset = PRESETS[p];
    if (!preset) throw new Error('Unknown provider: ' + p);
    const baseUrl = (settings.baseUrl || preset.baseUrl).replace(/\/+$/, '');
    const model = settings.model || preset.model;
    const messages = prompt(text, settings.level);
    if (preset.needsKey && !settings.apiKey) throw new Error('Missing API key — save it in the demo panel.');
    return { url: baseUrl + '/chat/completions', init: { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.apiKey },
      body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 400 }) } };
  }

  function parseResponse(provider, json) {
    return json?.choices?.[0]?.message?.content?.trim() || '';
  }

  async function explain(settings, text, fetchImpl = fetch) {
    const { url, init } = buildRequest(settings, text);
    const res = await fetchImpl(url, init);
    if (!res.ok) {
      let detail = ''; try { detail = (await res.text()).slice(0, 200); } catch (_) { /* ignore */ }
      throw new Error(`LLM request failed (${res.status}) ${detail}`);
    }
    return parseResponse(settings.provider || 'xai', await res.json());
  }

  const api = { PRESETS, buildRequest, parseResponse, explain, MAX_CHARS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CuriostaProviders = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
