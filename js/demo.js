/* UXVX site demo — consent-gated WebGazer + struggle flags + explain */
(function () {
  const STORAGE_KEY = 'uxvx-demo-settings-v1';
  const WEBGAZER_SRC = 'https://cdn.jsdelivr.net/gh/brownhci/WebGazer@3.3.0/dist/webgazer.min.js';
  const CALIB_POINTS = [
    [0.1, 0.12], [0.5, 0.12], [0.9, 0.12],
    [0.1, 0.5],  [0.5, 0.5],  [0.9, 0.5],
    [0.1, 0.88], [0.5, 0.88], [0.9, 0.88]
  ];
  const CLICKS_PER_POINT = 5;

  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');
  const consent = $('consent');
  const btnStart = $('btn-start');
  const btnStop = $('btn-stop');
  const btnCalibrate = $('btn-calibrate');
  const btnExplain = $('btn-explain-sel');
  const btnClear = $('btn-clear-flags');
  const btnSave = $('btn-save-settings');
  const providerSel = $('provider');
  const keyFields = $('key-fields');
  const apiKey = $('apiKey');
  const baseUrl = $('baseUrl');
  const model = $('model');
  const flagList = $('flag-list');
  const flagEmpty = $('flag-empty');
  const gazeDot = $('gaze-dot');
  const calibOverlay = $('calib-overlay');
  const calibMsg = $('calib-msg');
  const tip = $('explain-tip');
  const tipBody = $('tip-body');
  const tipClose = $('tip-close');
  const paragraphs = Array.from(document.querySelectorAll('#article p[data-uxvx-id]'));

  let detector = null;
  let running = false;
  let webgazerReady = false;
  let activeId = null;
  let gazeListener = null;

  function setStatus(text, state) {
    statusEl.textContent = text;
    statusEl.dataset.state = state || 'idle';
  }

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function saveSettings(partial) {
    const next = { ...loadSettings(), ...partial };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  function applySettingsToForm() {
    const s = loadSettings();
    providerSel.value = s.provider || 'mock';
    apiKey.value = s.apiKey || '';
    baseUrl.value = s.baseUrl || '';
    model.value = s.model || '';
    syncProviderFields();
  }

  function syncProviderFields() {
    const p = providerSel.value;
    keyFields.hidden = p === 'mock';
    if (p === 'xai') {
      if (!baseUrl.value) baseUrl.value = 'https://api.x.ai/v1';
      if (!model.value) model.value = 'grok-4-fast-non-reasoning';
    } else if (p === 'openai') {
      if (!baseUrl.value) baseUrl.value = 'https://api.openai.com/v1';
      if (!model.value) model.value = 'gpt-4o-mini';
    }
  }

  function wordCount(el) {
    return (window.CuriostaStruggle && CuriostaStruggle.wordCount(el.textContent)) ||
      (el.textContent.trim().match(/\S+/g) || []).length;
  }

  function paragraphAt(x, y) {
    for (const p of paragraphs) {
      const r = p.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return p;
    }
    // nearest vertically within horizontal band
    let best = null, bestDist = Infinity;
    for (const p of paragraphs) {
      const r = p.getBoundingClientRect();
      if (x < r.left - 40 || x > r.right + 40) continue;
      const cy = (r.top + r.bottom) / 2;
      const d = Math.abs(y - cy);
      if (d < bestDist && d < 120) { bestDist = d; best = p; }
    }
    return best;
  }

  function ensureDetector() {
    if (!detector) {
      detector = CuriostaStruggle.createDetector({
        dwellMs: 12000, // slightly shorter for a short demo article
        msPerWord: 350,
        minWords: 20,
        rereads: 3,
        cooldownMs: 45000
      });
    }
    return detector;
  }

  function onFlag(flag) {
    const el = paragraphs.find((p) => p.dataset.uxvxId === flag.id);
    if (!el) return;
    el.classList.add('uxvx-flagged');
    el.dataset.uxvxReason = flag.reason;
    if (flagEmpty) flagEmpty.remove();
    const li = document.createElement('li');
    const preview = el.textContent.trim().slice(0, 72) + '…';
    li.innerHTML = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = flag.reason + ' · ' + preview;
    btn.addEventListener('click', () => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      explainText(el.textContent, el);
    });
    li.appendChild(btn);
    flagList.prepend(li);
  }

  function clearFlags() {
    paragraphs.forEach((p) => {
      p.classList.remove('uxvx-flagged', 'uxvx-active');
      delete p.dataset.uxvxReason;
    });
    flagList.innerHTML = '';
    const empty = document.createElement('li');
    empty.className = 'muted';
    empty.id = 'flag-empty';
    empty.textContent = 'None yet — dwell ~12s+ or re-read 3×.';
    flagList.appendChild(empty);
    if (detector) detector.reset();
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.webgazer) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load WebGazer from CDN'));
      document.head.appendChild(s);
    });
  }

  async function startGaze() {
    if (!consent.checked) {
      setStatus('Consent required', 'error');
      return;
    }
    btnStart.disabled = true;
    setStatus('Loading gaze library…', 'idle');
    try {
      await loadScript(WEBGAZER_SRC);
      await webgazer
        .setRegression('ridge')
        .setTracker('TFFacemesh')
        .saveDataAcrossSessions(false)
        .begin();
      webgazer.showVideoPreview(true);
      webgazer.showPredictionPoints(false);
      webgazer.applyKalmanFilter(true);
      webgazerReady = true;
      running = true;
      ensureDetector();
      gazeListener = (data) => {
        if (!running || !data) return;
        const x = data.x, y = data.y;
        gazeDot.style.left = x + 'px';
        gazeDot.style.top = y + 'px';
        gazeDot.dataset.show = 'true';
        const hit = paragraphAt(x, y);
        const id = hit ? hit.dataset.uxvxId : null;
        if (activeId && activeId !== id) {
          const prev = paragraphs.find((p) => p.dataset.uxvxId === activeId);
          if (prev) prev.classList.remove('uxvx-active');
        }
        if (hit) hit.classList.add('uxvx-active');
        activeId = id;
        const words = hit ? wordCount(hit) : 0;
        const flags = detector.sample(id, performance.now(), words);
        flags.forEach(onFlag);
      };
      webgazer.setGazeListener(gazeListener);
      btnStop.disabled = false;
      btnCalibrate.disabled = false;
      setStatus('Gaze live · calibrate for better aim', 'live');
    } catch (err) {
      console.error(err);
      setStatus(err.message || 'Could not start camera', 'error');
      btnStart.disabled = !consent.checked;
      running = false;
    }
  }

  async function stopGaze() {
    running = false;
    gazeDot.dataset.show = 'false';
    paragraphs.forEach((p) => p.classList.remove('uxvx-active'));
    activeId = null;
    try {
      if (window.webgazer) {
        webgazer.clearGazeListener();
        await webgazer.end();
      }
    } catch (_) { /* ignore */ }
    webgazerReady = false;
    btnStop.disabled = true;
    btnCalibrate.disabled = true;
    btnStart.disabled = !consent.checked;
    setStatus('Camera idle · consent kept', 'idle');
  }

  function runCalibration() {
    if (!webgazerReady) return;
    let idx = 0;
    let clicks = 0;
    calibOverlay.dataset.open = 'true';
    calibOverlay.querySelectorAll('.calib-dot').forEach((d) => d.remove());

    function placeDot() {
      calibOverlay.querySelectorAll('.calib-dot').forEach((d) => d.remove());
      if (idx >= CALIB_POINTS.length) {
        calibOverlay.dataset.open = 'false';
        setStatus('Calibrated · gaze live', 'live');
        return;
      }
      const [fx, fy] = CALIB_POINTS[idx];
      clicks = 0;
      calibMsg.textContent = `Point ${idx + 1}/${CALIB_POINTS.length}: look at the coral dot and click it ${CLICKS_PER_POINT} times (${clicks}/${CLICKS_PER_POINT}).`;
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'calib-dot';
      dot.style.left = (fx * 100) + 'vw';
      dot.style.top = (fy * 100) + 'vh';
      dot.setAttribute('aria-label', 'Calibration point');
      dot.addEventListener('click', () => {
        clicks += 1;
        webgazer.recordScreenPosition(fx * window.innerWidth, fy * window.innerHeight, 'click');
        calibMsg.textContent = `Point ${idx + 1}/${CALIB_POINTS.length}: click ${CLICKS_PER_POINT - clicks} more time(s).`;
        if (clicks >= CLICKS_PER_POINT) {
          dot.dataset.done = 'true';
          idx += 1;
          setTimeout(placeDot, 200);
        }
      });
      calibOverlay.appendChild(dot);
    }
    placeDot();
  }

  function mockExplain(text) {
    const words = (text.trim().match(/\S+/g) || []).length;
    return Promise.resolve(
      'Mock explanation (no API key used):\n\n' +
      'This passage (~' + words + ' words) is about treating sensor readings as relative signals, not perfect truth, and asking vendors for calibration honesty.\n\n' +
      'Analogy: a bathroom scale that drifts 1 kg still helps you see week-to-week change if you always use the same scale on the same floor.'
    );
  }

  async function explainText(text, anchorEl) {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      tipBody.textContent = 'Select some text in the article first, or click a flagged paragraph.';
      openTip(anchorEl);
      return;
    }
    tipBody.textContent = 'Thinking…';
    openTip(anchorEl);
    const s = loadSettings();
    const provider = providerSel.value || s.provider || 'mock';
    try {
      let out;
      if (provider === 'mock') {
        out = await mockExplain(trimmed);
      } else {
        const settings = {
          provider,
          apiKey: apiKey.value || s.apiKey,
          baseUrl: baseUrl.value || s.baseUrl,
          model: model.value || s.model,
          level: 'curious beginner'
        };
        out = await CuriostaProviders.explain(settings, trimmed);
      }
      tipBody.textContent = out || '(empty response)';
    } catch (err) {
      tipBody.textContent = 'Error: ' + (err.message || String(err));
    }
  }

  function openTip(anchorEl) {
    tip.dataset.open = 'true';
    const r = (anchorEl && anchorEl.getBoundingClientRect) ? anchorEl.getBoundingClientRect() : { left: 24, bottom: 120, width: 280 };
    let left = Math.min(window.innerWidth - 440, Math.max(16, r.left));
    let top = r.bottom + 12;
    if (top + 160 > window.innerHeight) top = Math.max(16, r.top - 180);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  // Wire UI
  consent.addEventListener('change', () => {
    btnStart.disabled = !consent.checked || running;
    if (consent.checked && !running) setStatus('Consent given · ready to start', 'idle');
  });
  btnStart.addEventListener('click', startGaze);
  btnStop.addEventListener('click', stopGaze);
  btnCalibrate.addEventListener('click', runCalibration);
  btnClear.addEventListener('click', clearFlags);
  btnExplain.addEventListener('click', () => {
    const sel = window.getSelection && String(window.getSelection());
    const text = sel && sel.trim() ? sel : '';
    explainText(text, paragraphs[0]);
  });
  tipClose.addEventListener('click', () => { tip.dataset.open = 'false'; });
  providerSel.addEventListener('change', syncProviderFields);
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      saveSettings({
        provider: providerSel.value,
        apiKey: apiKey.value,
        baseUrl: baseUrl.value,
        model: model.value
      });
      setStatus('Settings saved in localStorage', 'idle');
    });
  }

  // Persist provider choice on change too (without forcing key save until Save)
  providerSel.addEventListener('change', () => {
    saveSettings({ provider: providerSel.value });
  });

  applySettingsToForm();
  setStatus('Camera idle · consent required', 'idle');

  // Expose for smoke tests
  window.__uxvxDemo = {
    get running() { return running; },
    clearFlags,
    mockExplain,
    paragraphCount: paragraphs.length
  };
})();
