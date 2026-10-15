// Pure struggle-detection logic. No DOM, no network. Works in browser and Node.
(function (root) {
  const DEFAULTS = { dwellMs: 20000, msPerWord: 400, minWords: 12, rereads: 3, cooldownMs: 60000 };

  function createDetector(opts = {}) {
    const cfg = { ...DEFAULTS, ...opts };
    const state = new Map(); // id -> {dwell, visits, lastExit, current, flaggedAt}
    let active = null, activeSince = 0;

    function get(id) {
      if (!state.has(id)) state.set(id, { dwell: 0, visits: 0, flaggedAt: -Infinity });
      return state.get(id);
    }
    function expectedMs(words) { return Math.max(cfg.dwellMs, words * cfg.msPerWord * 2); }

    // Feed a gaze sample: which paragraph (id or null) at time t, and its word count.
    function sample(id, t, words = 0) {
      const out = [];
      if (id !== active) {
        if (active !== null) get(active).dwell += t - activeSince;
        if (id !== null) get(id).visits += 1;
        active = id; activeSince = t;
      }
      if (id === null) return out;
      const s = get(id);
      s.words = words;
      if (words < cfg.minWords) return out;
      const dwell = s.dwell + (t - activeSince);
      const reason = dwell >= expectedMs(words) ? 'dwell' : s.visits >= cfg.rereads ? 'reread' : null;
      if (reason && t - s.flaggedAt >= cfg.cooldownMs) {
        s.flaggedAt = t;
        out.push({ id, reason, dwell, visits: s.visits });
      }
      return out;
    }
    function stats(id) { return state.get(id) ? { ...state.get(id) } : null; }
    function reset() { state.clear(); active = null; }
    return { sample, stats, reset, cfg, expectedMs };
  }

  function wordCount(text) { return (String(text).trim().match(/\S+/g) || []).length; }

  const api = { createDetector, wordCount, DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CuriostaStruggle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
