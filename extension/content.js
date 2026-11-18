// yravgCapture bar (isolated world). Engine = vendor/orca-main.js (MAIN world) + vendor/orca-format.js,
// both generated from stablyai/orca by scripts/sync-orca.mjs. Draw + Robo are local.
(() => {
  if (window.__yravgCap) return;
  const F = window.__yravgOrcaFormat;
  const MODES = {
    annotate: { label: 'Annotate', hint: 'Annotate page element', key: 'Alt+Shift+N' },
    grab: { label: 'Grab', hint: 'Grab page element', key: 'Alt+Shift+G' },
    draw: { label: 'Draw', hint: 'Draw on screenshot', key: 'Alt+Shift+D' },
    robo: { label: 'Robo', hint: 'Robo Capture (web-capture JSON)', key: '' }
  };
  const ICON = {
    annotate: '<path d="M4 4h16v12H9l-5 4z"/><path d="M12 8v4M10 10h4"/>',
    grab: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    draw: '<path d="M4 20l1-4L17 4l3 3L8 19z"/><path d="M14 7l3 3"/>',
    robo: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/>'
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

  let mode = 'annotate';
  let armed = false;
  const annotations = [];
  try { chrome.storage.local.get('mode', (v) => { if (MODES[v.mode]) { mode = v.mode; paint(); } }); } catch (e) {}

  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;left:0;top:0;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    *{box-sizing:border-box;font-family:Inter,'Segoe UI',system-ui,sans-serif}
    .bar{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);display:flex;align-items:center;gap:2px;background:#131311;color:#e8e2d2;border:1px solid #3a372f;border-radius:10px;padding:4px;box-shadow:0 8px 28px rgba(0,0,0,.45);font-size:13px}
    button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:7px;color:inherit;font-size:13px}
    button:hover{background:#26231d} button:focus-visible{outline:2px solid #ff6b1a}
    .main{font-weight:600} .sep{width:1px;height:20px;background:#3a372f;margin:0 2px}
    .badge{background:#ff6b1a;color:#131311;border-radius:9px;padding:0 6px;font-size:11px;font-weight:700}
    .menu{position:fixed;left:50%;bottom:70px;transform:translateX(-50%);background:#131311;color:#e8e2d2;border:1px solid #3a372f;border-radius:10px;padding:6px;min-width:290px;box-shadow:0 8px 28px rgba(0,0,0,.45)}
    .menu button{display:flex;width:100%;justify-content:flex-start} .menu .k{margin-left:auto;color:#8d8775;font-size:12px}
    .menu .on{background:#26231d}
    .toast{position:fixed;left:50%;bottom:76px;transform:translateX(-50%);background:#ff6b1a;color:#131311;padding:7px 12px;border-radius:8px;font-size:13px;font-weight:600}
    .composer{position:fixed;width:300px;background:#131311;color:#e8e2d2;border:1px solid #ff6b1a;border-radius:10px;padding:10px;box-shadow:0 8px 28px rgba(0,0,0,.5);font-size:13px}
    .composer textarea{width:100%;min-height:64px;background:#1c1a16;color:inherit;border:1px solid #3a372f;border-radius:7px;padding:7px;font-size:13px;resize:vertical}
    .composer .row{display:flex;gap:6px;align-items:center;margin-top:8px} .composer select{background:#1c1a16;color:inherit;border:1px solid #3a372f;border-radius:6px;padding:5px}
    .composer .lbl{color:#8d8775;font-size:12px;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .primary{background:#ff6b1a;color:#131311;font-weight:600;margin-left:auto}
    .draw{position:fixed;inset:0;background:#000}.draw canvas{position:absolute;left:0;top:0;width:100vw;height:100vh;cursor:crosshair}
    .dtools{position:fixed;left:50%;top:14px;transform:translateX(-50%);display:flex;gap:2px;background:#131311;border:1px solid #3a372f;border-radius:10px;padding:4px;color:#e8e2d2}
    .dtools .on{background:#26231d}
  </style><div class="bar"></div>`;
  const bar = root.querySelector('.bar');
  const $ = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  const remove = (sel) => root.querySelectorAll(sel).forEach((n) => n.remove());

  const toast = (msg) => { remove('.toast'); const t = $(`<div class="toast"></div>`); t.textContent = msg; root.appendChild(t); setTimeout(() => t.remove(), 2200); };
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast('Copied'); }
    catch (e) { toast('Copy blocked by the page'); }
  };
  const call = (msg) => new Promise((res) => chrome.runtime.sendMessage(msg, (r) => res(r || { ok: false, error: chrome.runtime.lastError?.message })));

  function paint() {
    const m = MODES[mode];
    bar.innerHTML = '';
    const main = $(`<button class="main" title="${m.hint}">${svg(mode)}${armed ? 'Pick an element…' : m.label}</button>`);
    main.onclick = () => run(mode);
    const caret = $(`<button aria-label="Choose capture mode" title="Mode"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button>`);
    caret.onclick = openMenu;
    bar.append(main, caret);
    if (annotations.length) {
      const c = $(`<button title="Copy all annotations">Copy <span class="badge">${annotations.length}</span></button>`);
      c.onclick = () => copy(F.formatBrowserAnnotationsAsMarkdown(annotations, { includeDiagnostics: true }));
      const x = $(`<button title="Clear annotations" aria-label="Clear annotations">Clear</button>`);
      x.onclick = () => { annotations.length = 0; paint(); };
      bar.append($('<span class="sep"></span>'), c, x);
    }
    const close = $(`<button aria-label="Close yravgCapture" title="Close">✕</button>`);
    close.onclick = destroy;
    bar.append($('<span class="sep"></span>'), close);
  }

  function openMenu() {
    if (root.querySelector('.menu')) return remove('.menu');
    const m = $('<div class="menu" role="menu"></div>');
    for (const k of Object.keys(MODES)) {
      const b = $(`<button role="menuitem" class="${k === mode ? 'on' : ''}">${svg(k)}${MODES[k].hint}<span class="k">${MODES[k].key}</span></button>`);
      b.onclick = () => run(k);
      m.appendChild(b);
    }
    root.appendChild(m);
  }

  function setMode(k) {
    mode = k;
    try { chrome.storage.local.set({ mode }); } catch (e) {}
  }

  async function run(k) {
    remove('.menu');
    cancelPick();
    setMode(k);
    if (k === 'annotate' || k === 'grab') await startPick(k);
    else if (k === 'draw') await startDraw();
    else { const r = await call({ type: 'robo' }); if (!r.ok) toast('Robo failed: ' + r.error); }
    paint();
  }

  // ---- Orca element pick -------------------------------------------------
  let onResult = null;
  const cancelPick = () => { document.dispatchEvent(new CustomEvent('yravg-orca-cancel')); if (onResult) document.removeEventListener('yravg-orca-result', onResult); onResult = null; armed = false; remove('.composer'); };

  async function startPick(kind) {
    onResult = (ev) => {
      document.removeEventListener('yravg-orca-result', onResult); onResult = null; armed = false;
      let r; try { r = JSON.parse(ev.detail); } catch (e) { r = { __error: 'bad result' }; }
      if (r.__orcaCancelled) return paint();
      if (r.__error) { toast(r.__error === 'cancelled' ? 'Cancelled' : 'Capture failed: ' + r.__error); return paint(); }
      const payload = r.payload || r;
      if (kind === 'grab' && !r.__orcaContextMenu) { copy(F.formatGrabPayloadAsText(payload)); document.dispatchEvent(new CustomEvent('yravg-orca-cancel')); return paint(); }
      composer(payload);
    };
    document.addEventListener('yravg-orca-result', onResult);
    const r = await call({ type: 'arm' });
    if (!r.ok) { document.removeEventListener('yravg-orca-result', onResult); onResult = null; return toast('Cannot run on this page'); }
    armed = true;
    paint();
  }

  function composer(payload) {
    const t = payload.target, rc = t.rectViewport;
    const el = $(`<div class="composer"><div class="lbl"></div><textarea placeholder="What should change? (Ctrl+Enter to add)" autofocus></textarea>
      <div class="row"><select aria-label="Intent"><option>fix</option><option>change</option><option>question</option><option>approve</option></select>
      <button class="primary">Add</button><button class="cancel">Cancel</button></div></div>`);
    el.querySelector('.lbl').textContent = `${t.tagName} · ${t.selector}`;
    el.style.left = Math.max(8, Math.min(innerWidth - 316, rc.x)) + 'px';
    el.style.top = Math.max(8, Math.min(innerHeight - 190, rc.y + rc.height + 8)) + 'px';
    const ta = el.querySelector('textarea');
    const done = (add) => {
      if (add) annotations.push({ id: 'a' + Date.now().toString(36), browserPageId: '', comment: ta.value.trim(), intent: el.querySelector('select').value, priority: 'important', createdAt: new Date().toISOString(), payload: { ...payload, screenshot: null } });
      cancelPick();
      if (add) startPick('annotate'); else paint();
    };
    el.querySelector('.primary').onclick = () => done(true);
    el.querySelector('.cancel').onclick = () => done(false);
    ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) done(true); if (e.key === 'Escape') done(false); });
    ta.addEventListener('keyup', (e) => e.stopPropagation());
    root.appendChild(el);
    ta.focus();
  }

  // ---- Draw on screenshot (local; Orca's markup editor is React and not syncable) --------------
  async function startDraw() {
    bar.style.visibility = 'hidden';
    await new Promise((r) => setTimeout(r, 120));
    const r = await call({ type: 'shot' });
    bar.style.visibility = '';
    if (!r.ok) return toast('Screenshot failed: ' + r.error);
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = r.dataUrl; });
    const wrap = $('<div class="draw"><canvas></canvas></div>');
    const cv = wrap.querySelector('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext('2d');
    const k = img.naturalWidth / innerWidth;
    const shapes = []; let tool = 'pen', cur = null;
    const redraw = () => {
      ctx.drawImage(img, 0, 0);
      ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 3 * k; ctx.lineCap = ctx.lineJoin = 'round';
      for (const s of cur ? [...shapes, cur] : shapes) {
        ctx.beginPath();
        if (s.t === 'rect') ctx.strokeRect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
        else { s.p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
      }
    };
    const pt = (e) => [e.clientX * k, e.clientY * k];
    cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); const [x, y] = pt(e); cur = tool === 'rect' ? { t: 'rect', x0: x, y0: y, x1: x, y1: y } : { t: 'pen', p: [[x, y]] }; };
    cv.onpointermove = (e) => { if (!cur) return; const [x, y] = pt(e); if (cur.t === 'rect') { cur.x1 = x; cur.y1 = y; } else cur.p.push([x, y]); redraw(); };
    cv.onpointerup = () => { if (cur) shapes.push(cur); cur = null; redraw(); };
    const tools = $(`<div class="dtools"><button data-t="pen" class="on">Pen</button><button data-t="rect">Box</button><button data-u>Undo</button><span class="sep"></span><button data-c class="primary">Copy PNG</button><button data-s>Save</button><button data-x aria-label="Close">✕</button></div>`);
    const blob = () => new Promise((res) => cv.toBlob(res, 'image/png'));
    tools.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.t) { tool = b.dataset.t; tools.querySelectorAll('[data-t]').forEach((n) => n.classList.toggle('on', n === b)); }
      else if ('u' in b.dataset) { shapes.pop(); redraw(); }
      else if ('c' in b.dataset) { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': await blob() })]); toast('Copied screenshot'); } catch (err) { toast('Copy blocked - use Save'); } }
      else if ('s' in b.dataset) { const a = document.createElement('a'); a.href = URL.createObjectURL(await blob()); a.download = 'yravg-capture-' + Date.now() + '.png'; a.click(); }
      else if ('x' in b.dataset) close();
    };
    const key = (e) => { if (e.key === 'Escape') close(); };
    const close = () => { wrap.remove(); tools.remove(); window.removeEventListener('keydown', key, true); };
    window.addEventListener('keydown', key, true);
    redraw();
    root.append(wrap, tools);
  }

  function destroy() { cancelPick(); host.remove(); window.removeEventListener('keydown', esc, true); delete window.__yravgCap; }
  const esc = (e) => { if (e.key === 'Escape' && armed) { cancelPick(); paint(); } };
  window.addEventListener('keydown', esc, true);

  chrome.runtime.onMessage.addListener((msg) => {
    if (!document.documentElement.contains(host)) return;
    if (msg.type === 'toggle') { host.style.display = host.style.display === 'none' ? '' : 'none'; return; }
    if (msg.type === 'mode') { host.style.display = ''; run(msg.mode); }
  });

  window.__yravgCap = { destroy };
  document.documentElement.appendChild(host);
  paint();
})();
