# UXVX site (uxvx.curiosta.com)

Static PoC site for **UXVX** — privacy-first gaze-aware reading demo. Companion to the private Chrome extension [`curiosta/uxvx`](https://github.com/curiosta/uxvx).

## Pages
- `/` — product pitch, honest limits, extension CTA (private beta)
- `/demo/` — in-browser WebGazer demo (consent-gated), struggle highlights, mock or BYO LLM explain
- `/privacy/` — privacy policy

## Run locally
```bash
cd uxvx-site
python3 -m http.server 8765
# then open the URL the server prints (home + /demo/)
```

No build step. GitHub Pages-ready: `CNAME` → `uxvx.curiosta.com`, `.nojekyll` present.

## Privacy model
Camera off until opt-in. Video processed in-browser only. Settings/keys in `localStorage`. See `/privacy/`.

## Limits
Webcam gaze is coarse. Struggle thresholds are heuristics. Extension repo is private; this site does not promise a public Web Store install. Remote LLM explain from the browser may hit CORS — use **Mock** for a reliable PoC, or the extension for BYO keys.
