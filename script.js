  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const root = document.documentElement.style;

  let currentMode = 'dark';
  let viewMode = 'edit';
  let currentDocId = null;
  let storageOK = true;
  let saveDebounce = null;

  // ---------------- storage helpers (browser localStorage, per-device) ----------------
  const STORAGE_PREFIX = 'clarity:';
  async function storeGet(key){
    try { const v = localStorage.getItem(STORAGE_PREFIX + key); return v ? JSON.parse(v) : null; }
    catch(e){ return null; }
  }
  async function storeSet(key, value){
    try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)); storageOK = true; return true; }
    catch(e){ storageOK = false; return false; }
  }
  async function storeDelete(key){
    try { localStorage.removeItem(STORAGE_PREFIX + key); } catch(e){}
  }
  async function storeListKeys(prefix){
    try {
      const keys = [];
      for(let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if(k && k.startsWith(STORAGE_PREFIX + prefix)) keys.push(k.slice(STORAGE_PREFIX.length));
      }
      return keys;
    } catch(e){ return []; }
  }

  // ---------------- mode switching ----------------
  function setMode(mode, skipSave){
    currentMode = mode;
    ['btnDark','btnBright','btnEye'].forEach(id => document.getElementById(id).classList.remove('active'));
    document.getElementById('eyeControls').style.display = 'none';
    document.getElementById('eyeDivider').style.display = 'none';

    if(mode === 'dark'){
      document.getElementById('btnDark').classList.add('active');
      applyPalette('#0A0A0A', '#F5F5F0', '#6EE7C8', '#141414', '#2A2A2A', '#9A9A94');
    } else if(mode === 'bright'){
      document.getElementById('btnBright').classList.add('active');
      applyPalette('#FFFFFF', '#101010', '#0F766E', '#F4F4F2', '#DCDCD8', '#5A5A54');
    } else if(mode === 'eye'){
      document.getElementById('btnEye').classList.add('active');
      document.getElementById('eyeControls').style.display = 'block';
      document.getElementById('eyeDivider').style.display = 'block';
      updateEyeMode(true);
    }
    const modeLabels = { dark: 'Dark', bright: 'Bright', eye: 'Eye Care' };
    const labelEl = document.getElementById('bgModeLabel');
    if(labelEl) labelEl.textContent = modeLabels[mode] || mode;
    if(particleStyleByMode[mode] === 'nebula') particleStyleByMode[mode] = 'aurora'; // migrate old saves
    if(!(MODE_STYLES[mode] || []).includes(particleStyleByMode[mode])){
      particleStyleByMode[mode] = 'none'; // style no longer offered in this mode
    }
    renderSwatches(mode);
    setParticleStyle(particleStyleByMode[mode] || 'none', true);
    updateContrast();
    if(!skipSave) saveSettings();
  }

  function applyPalette(bg, text, accent, panel, border, muted){
    root.setProperty('--bg', bg);
    root.setProperty('--text', text);
    root.setProperty('--accent', accent);
    root.setProperty('--panel', panel);
    root.setProperty('--border', border);
    root.setProperty('--muted', muted);
  }

  function updateEyeMode(skipSave){
    const bright = parseInt(document.getElementById('eyeBright').value);
    const warm = parseInt(document.getElementById('eyeWarm').value);
    document.getElementById('eyeBrightVal').textContent = bright + '%';
    document.getElementById('eyeWarmVal').textContent = warm + '°';

    const hue = 45 - (warm - 20) * 0.3;
    const bgLightness = bright;
    const bg = `hsl(${hue}, 38%, ${bgLightness}%)`;
    const textLightness = Math.min(96, bgLightness + 58);
    const text = `hsl(${hue}, 30%, ${textLightness}%)`;
    const panel = `hsl(${hue}, 34%, ${Math.max(4, bgLightness - 8)}%)`;
    const border = `hsl(${hue}, 30%, ${Math.max(8, bgLightness - 2)}%)`;
    const muted = `hsl(${hue}, 20%, ${Math.min(80, bgLightness + 30)}%)`;
    const accent = `hsl(${hue - 15}, 55%, 60%)`;

    applyPalette(bg, text, accent, panel, border, muted);
    updateContrast();
    if(!skipSave) saveSettings();
  }

  function updateType(skipSave){
    const fs = document.getElementById('fontSize').value;
    const lh = document.getElementById('lineHeight').value;
    const measure = document.getElementById('measure').value;
    document.getElementById('fontSizeVal').textContent = fs + 'px';
    document.getElementById('lineHeightVal').textContent = (lh/100).toFixed(2);
    document.getElementById('measureVal').textContent = measure + 'ch';
    root.setProperty('--font-size', fs + 'px');
    root.setProperty('--line-height', (lh/100));
    root.setProperty('--measure', measure + 'ch');
    if(!skipSave) saveSettings();
  }

  const FONT_STACKS = {
    sans: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    hyperlegible: '"Atkinson Hyperlegible", -apple-system, "Segoe UI", sans-serif',
    inter: '"Inter", -apple-system, "Segoe UI", sans-serif',
    sourceSans: '"Source Sans 3", -apple-system, "Segoe UI", sans-serif',
    serif: 'Georgia, "Times New Roman", Times, serif',
    lora: '"Lora", Georgia, serif',
    merriweather: '"Merriweather", Georgia, serif',
    literata: '"Literata", Georgia, serif',
    garamond: '"EB Garamond", Georgia, serif',
    playfair: '"Playfair Display", Georgia, serif',
    mono: '"IBM Plex Mono", "SFMono-Regular", Menlo, monospace',
    robotoMono: '"Roboto Mono", "SFMono-Regular", Menlo, monospace',
    caveat: '"Caveat", cursive',
    comicNeue: '"Comic Neue", "Comic Sans MS", cursive'
  };

  function updateFontFamily(skipSave){
    const key = document.getElementById('fontFamily').value;
    root.setProperty('--content-font', FONT_STACKS[key] || FONT_STACKS.sans);
    if(!skipSave) saveSettings();
  }

  function setViewMode(mode){
    viewMode = mode;
    document.getElementById('btnEdit').classList.toggle('active', mode==='edit');
    document.getElementById('btnPreview').classList.toggle('active', mode==='preview');
    if(mode === 'preview'){
      preview.innerHTML = renderMarkdown(editor.value);
      editor.style.display = 'none';
      preview.style.display = 'block';
    } else {
      editor.style.display = 'block';
      preview.style.display = 'none';
      editor.focus();
    }
  }

  // ---------------- word count / draft autosave ----------------
  function onEditorInput(){
    updateWordCount();
    if(viewMode === 'preview') preview.innerHTML = renderMarkdown(editor.value);
    document.getElementById('saveStatus').textContent = 'Unsaved changes…';
    clearTimeout(saveDebounce);
    saveDebounce = setTimeout(autosaveDraft, 900);
  }
  function onTitleEdited(){
    clearTimeout(saveDebounce);
    saveDebounce = setTimeout(autosaveDraft, 900);
  }
  async function autosaveDraft(){
    await storeSet('draft', { title: document.getElementById('docTitle').value, content: editor.value, docId: currentDocId });
    document.getElementById('saveStatus').textContent = storageOK ? 'Draft auto-saved.' : 'Draft kept in this tab only (storage unavailable).';
  }
  function updateWordCount(){
    const t = editor.value.trim();
    const words = t.length ? t.split(/\s+/).length : 0;
    document.getElementById('wordCount').textContent = `${words} words · ${t.length} characters`;
  }

  // ---------------- WCAG contrast ----------------
  function parseColorToRGB(colorStr){
    const el = document.createElement('div');
    el.style.color = colorStr;
    document.body.appendChild(el);
    const rgb = getComputedStyle(el).color;
    document.body.removeChild(el);
    const m = rgb.match(/\d+(\.\d+)?/g).map(Number);
    return { r: m[0], g: m[1], b: m[2] };
  }
  function relLuminance({r,g,b}){
    const srgb = [r,g,b].map(v => { v = v/255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    return 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2];
  }
  function contrastRatio(c1, c2){
    const L1 = relLuminance(c1), L2 = relLuminance(c2);
    return (Math.max(L1,L2) + 0.05) / (Math.min(L1,L2) + 0.05);
  }
  function updateContrast(){
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    const text = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
    const ratio = contrastRatio(parseColorToRGB(bg), parseColorToRGB(text));
    const dot = document.getElementById('contrastDot');
    const label = document.getElementById('contrastText');
    let grade, color;
    if(ratio >= 7){ grade = 'AAA'; color = '#6EE7C8'; }
    else if(ratio >= 4.5){ grade = 'AA'; color = '#F5D76E'; }
    else { grade = 'Too low'; color = '#FF6B5E'; }
    dot.style.background = color;
    label.textContent = `Contrast ${ratio.toFixed(1)}:1 — ${grade}`;
  }

  // ---------------- markdown renderer ----------------
  function escapeHtml(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function renderInline(s){
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }
  function renderMarkdown(src){
    if(!src.trim()) return '<p style="color:var(--muted)">Nothing to preview yet.</p>';
    const lines = escapeHtml(src).split('\n');
    let html = '', inCode = false, codeBuf = [], listType = null, listBuf = [], paraBuf = [];
    // Joining with a space here was standard Markdown behavior (a single
    // Enter doesn't start a new line, only a blank line does) -- but it
    // silently ate every line break the user actually typed, which
    // contradicts Clarity's own "paste it, read it properly" promise.
    // Each Enter the user pressed now stays a visible line break.
    function flushPara(){ if(paraBuf.length){ html += '<p>' + renderInline(paraBuf.join('<br>')) + '</p>'; paraBuf = []; } }
    function flushList(){
      if(listBuf.length){
        const tag = listType === 'ol' ? 'ol' : 'ul';
        html += `<${tag}>` + listBuf.map(li => `<li>${renderInline(li)}</li>`).join('') + `</${tag}>`;
        listBuf = []; listType = null;
      }
    }
    for(const raw of lines){
      const line = raw;
      if(line.trim().startsWith('```')){
        if(inCode){ html += '<pre><code>' + codeBuf.join('\n') + '</code></pre>'; codeBuf = []; inCode = false; }
        else { flushPara(); flushList(); inCode = true; }
        continue;
      }
      if(inCode){ codeBuf.push(line); continue; }
      if(/^\s*$/.test(line)){ flushPara(); flushList(); continue; }
      if(/^###\s+/.test(line)){ flushPara(); flushList(); html += '<h3>' + renderInline(line.replace(/^###\s+/,'')) + '</h3>'; continue; }
      if(/^##\s+/.test(line)){ flushPara(); flushList(); html += '<h2>' + renderInline(line.replace(/^##\s+/,'')) + '</h2>'; continue; }
      if(/^#\s+/.test(line)){ flushPara(); flushList(); html += '<h1>' + renderInline(line.replace(/^#\s+/,'')) + '</h1>'; continue; }
      if(/^(-{3,}|\*{3,})\s*$/.test(line)){ flushPara(); flushList(); html += '<hr>'; continue; }
      if(/^&gt;\s?/.test(line)){ flushPara(); flushList(); html += '<blockquote>' + renderInline(line.replace(/^&gt;\s?/,'')) + '</blockquote>'; continue; }
      if(/^\s*[-*]\s+/.test(line)){ flushPara(); if(listType !== 'ul'){ flushList(); listType = 'ul'; } listBuf.push(line.replace(/^\s*[-*]\s+/, '')); continue; }
      if(/^\s*\d+\.\s+/.test(line)){ flushPara(); if(listType !== 'ol'){ flushList(); listType = 'ol'; } listBuf.push(line.replace(/^\s*\d+\.\s+/, '')); continue; }
      flushList();
      paraBuf.push(line);
    }
    flushPara(); flushList();
    if(inCode && codeBuf.length) html += '<pre><code>' + codeBuf.join('\n') + '</code></pre>';
    return html;
  }

  // ---------------- document management ----------------
  function genId(){ return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function deriveTitle(content){
    const firstLine = content.split('\n').find(l => l.trim().length);
    if(!firstLine) return 'Untitled';
    return firstLine.replace(/^#+\s*/,'').slice(0,48);
  }
  function newDoc(){
    currentDocId = null;
    editor.value = '';
    document.getElementById('docTitle').value = '';
    updateWordCount();
    setViewMode('edit');
    document.getElementById('saveStatus').textContent = 'New document.';
    storeDelete('draft');
    renderDocList();
  }
  async function saveDoc(){
    const content = editor.value;
    let title = document.getElementById('docTitle').value.trim();
    if(!title) title = deriveTitle(content);
    if(!currentDocId) currentDocId = genId();
    const doc = { id: currentDocId, title, content, updatedAt: Date.now() };
    await storeSet('doc:' + currentDocId, doc);
    document.getElementById('docTitle').value = title;
    document.getElementById('saveStatus').textContent = storageOK ? 'Saved.' : 'Could not save — storage unavailable.';
    await storeDelete('draft');
    renderDocList();
  }
  async function loadDoc(id){
    const doc = await storeGet('doc:' + id);
    if(!doc) return;
    currentDocId = doc.id;
    editor.value = doc.content;
    document.getElementById('docTitle').value = doc.title;
    updateWordCount();
    setViewMode('edit');
    document.getElementById('saveStatus').textContent = 'Loaded.';
    renderDocList();
  }
  async function deleteDoc(id, evt){
    evt.stopPropagation();
    await storeDelete('doc:' + id);
    if(currentDocId === id) newDoc();
    else renderDocList();
  }
  function timeAgo(ts){
    const s = Math.floor((Date.now() - ts) / 1000);
    if(s < 60) return 'just now';
    const m = Math.floor(s/60); if(m < 60) return m + 'm ago';
    const h = Math.floor(m/60); if(h < 24) return h + 'h ago';
    const d = Math.floor(h/24); if(d < 30) return d + 'd ago';
    return new Date(ts).toLocaleDateString();
  }
  async function renderDocList(){
    const listEl = document.getElementById('docList');
    const keys = await storeListKeys('doc:');
    if(!keys || !keys.length){ listEl.innerHTML = '<div class="empty-note">Nothing saved yet.</div>'; return; }
    const docs = [];
    for(const k of keys){ const d = await storeGet(k); if(d) docs.push(d); }
    docs.sort((a,b) => b.updatedAt - a.updatedAt);
    listEl.innerHTML = '';
    for(const d of docs){
      const item = document.createElement('div');
      item.className = 'doc-item' + (d.id === currentDocId ? ' active' : '');
      item.onclick = () => loadDoc(d.id);
      item.innerHTML = `
        <div class="doc-item-text">
          <div class="doc-item-title">${escapeHtml(d.title || 'Untitled')}</div>
          <div class="doc-item-date">${timeAgo(d.updatedAt)}</div>
        </div>
        <button class="doc-item-del" title="Delete" aria-label="Delete document">×</button>`;
      item.querySelector('.doc-item-del').onclick = (e) => deleteDoc(d.id, e);
      listEl.appendChild(item);
    }
  }

  // ---------------- settings persistence ----------------
  async function saveSettings(){
    await storeSet('settings', {
      mode: currentMode,
      fontSize: document.getElementById('fontSize').value,
      lineHeight: document.getElementById('lineHeight').value,
      measure: document.getElementById('measure').value,
      eyeBright: document.getElementById('eyeBright').value,
      eyeWarm: document.getElementById('eyeWarm').value,
      fontFamily: document.getElementById('fontFamily').value,
      particleStyleByMode: particleStyleByMode,
      voiceName: selectedVoiceName,
      rate: document.getElementById('rateRange').value
    });
  }
  async function loadSettings(){
    const s = await storeGet('settings');
    if(!s) return;
    document.getElementById('fontSize').value = s.fontSize;
    document.getElementById('lineHeight').value = s.lineHeight;
    document.getElementById('measure').value = s.measure;
    document.getElementById('eyeBright').value = s.eyeBright;
    document.getElementById('eyeWarm').value = s.eyeWarm;
    if(s.fontFamily){ document.getElementById('fontFamily').value = s.fontFamily; }
    updateFontFamily(true);
    if(s.particleStyleByMode) Object.assign(particleStyleByMode, s.particleStyleByMode);
    if(s.voiceName) selectedVoiceName = s.voiceName;
    if(s.rate){ document.getElementById('rateRange').value = s.rate; }
    onRateChange(true);
    updateType(true);
    setMode(s.mode || 'dark', true);
  }

  // ---------------- file ops ----------------
  function fileBaseName(){
    return (document.getElementById('docTitle').value || deriveTitle(editor.value) || 'clarity').replace(/[^a-z0-9\-_]+/gi,'-');
  }
  function downloadBlob(content, mime, ext){
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    a.href = url; a.download = `${fileBaseName()}-${stamp}.${ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  // Exports are disabled for an empty document -- a document only counts as
  // non-empty if it has real content beyond whitespace.
  function hasExportableContent(){
    return editor.value.trim().length > 0;
  }
  function warnEmptyExport(){
    const statusEl = document.getElementById('saveStatus');
    if(statusEl) statusEl.textContent = 'Nothing to export yet -- write something first.';
  }
  function downloadText(){
    if(!hasExportableContent()) return warnEmptyExport();
    downloadBlob(editor.value, 'text/plain', 'txt');
  }
  function downloadMarkdown(){
    if(!hasExportableContent()) return warnEmptyExport();
    downloadBlob(editor.value, 'text/markdown', 'md');
  }
  function copyText(){ navigator.clipboard.writeText(editor.value).catch(()=>{}); }
  function clearText(){ editor.value = ''; updateWordCount(); if(viewMode==='preview') preview.innerHTML = renderMarkdown(''); }

  function exportPDF(){
    if(!hasExportableContent()) return warnEmptyExport();
    const explicitTitle = document.getElementById('docTitle').value.trim();
    const title = explicitTitle || deriveTitle(editor.value) || 'Untitled';
    const printArea = document.getElementById('printArea');
    // Only print a separate H1 title when the user actually typed one in
    // the title field. Otherwise it's auto-derived from the body's own
    // first line, and printing it as a heading too just duplicates what's
    // already the first line of the document.
    const heading = explicitTitle ? '<h1 class="print-title">' + escapeHtml(explicitTitle) + '</h1>' : '';
    printArea.innerHTML = heading + renderMarkdown(editor.value);
    document.title = title;
    window.print();
  }

  // ---------------- particle backgrounds ----------------
  const canvas = document.getElementById('bgCanvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let currentParticleStyle = 'none';
  let bubbleBurstStart = 0; // timestamp used to decay bubbles from a fast burst to normal speed
  const particleStyleByMode = { dark: 'none', bright: 'none', eye: 'none' };

  // Each mode gets its own curated set of backgrounds -- styles that looked
  // washed out or invisible against that mode's palette were dropped rather
  // than kept in every mode by default.
  const STYLE_META = {
    none:          { label: 'None',         dot: 'transparent' },
    aurora:        { label: 'Aurora',       dot: '#8B7CF6' }, // replaces the old "Nebula"
    bubbles:       { label: 'Bubbles',      dot: '#9AD6D0' },
    stars:         { label: 'Stars',        dot: '#E8E8E0' },
    waves:         { label: 'Waves',        dot: '#7BD8C4' },
    snowfall:      { label: 'Snowfall',     dot: '#CFE8FF' },
    clouds:        { label: 'Clouds',       dot: '#9A9A9A' },
    'pastel-drift':{ label: 'Pastel Drift', dot: '#FFB8D9' },
    embers:        { label: 'Embers',       dot: '#FF9A5A' },
  };
  const MODE_STYLES = {
    dark:   ['none', 'aurora', 'stars', 'waves', 'bubbles', 'snowfall'],
    bright: ['none', 'clouds', 'pastel-drift', 'waves'],
    eye:    ['none', 'embers', 'stars', 'snowfall'],
  };

  function renderSwatches(mode){
    const box = document.getElementById('swatchContainer');
    if(!box) return;
    const active = particleStyleByMode[mode] || 'none';
    box.innerHTML = '';
    (MODE_STYLES[mode] || ['none']).forEach(styleKey => {
      const meta = STYLE_META[styleKey];
      const btn = document.createElement('button');
      btn.className = 'swatch-btn' + (styleKey === active ? ' active' : '');
      btn.dataset.style = styleKey;
      btn.onclick = () => setParticleStyle(styleKey);
      const dotStyle = styleKey === 'none'
        ? 'background:transparent;border:1px dashed var(--muted)'
        : 'background:' + meta.dot;
      btn.innerHTML = '<span class="swatch-dot" style="' + dotStyle + '"></span>' + meta.label;
      box.appendChild(btn);
    });
  }

  function resizeCanvas(){ canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function getThemeColors(){
    const cs = getComputedStyle(document.documentElement);
    return { bg: cs.getPropertyValue('--bg').trim(), accent: cs.getPropertyValue('--accent').trim(), muted: cs.getPropertyValue('--muted').trim() };
  }

  function colorWithAlpha(colorStr, alpha){
    const { r, g, b } = parseColorToRGB(colorStr);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function initParticles(style){
    currentParticleStyle = style;
    particles = [];
    const w = canvas.width, h = canvas.height;
    if(style === 'none') return;

    if(style === 'aurora'){
      // Multiple overlapping, differently-colored ribbons that blend where
      // they cross (via 'lighter' composite in the draw step) -- a real
      // aurora palette (teal, violet, magenta, blue) instead of one tinted
      // accent color. Each band sums two sine waves at different speeds so
      // the motion reads as organic undulation, not a single clean sine.
      const AURORA_PALETTE = ['#4DF0C4', '#8B7CF6', '#F15BB5', '#4D9DF0', '#6EE7A8'];
      for(let i=0;i<5;i++){
        particles.push({
          color: AURORA_PALETTE[i % AURORA_PALETTE.length],
          // spread across the FULL height (0.08h to 0.96h), not just the
          // top ~75% -- that's what was leaving the bottom of the screen empty
          baseY: h*(0.08 + i*0.22) + Math.random()*30,
          amp: 70 + Math.random()*55,
          amp2: 25 + Math.random()*20,
          freq: 0.0016 + Math.random()*0.0012,
          freq2: 0.0045 + Math.random()*0.002,
          phase: Math.random()*Math.PI*2,
          phase2: Math.random()*Math.PI*2,
          speed: 0.0014 + Math.random()*0.0014,
          speed2: 0.0026 + Math.random()*0.0018,
          thickness: 70 + Math.random()*55,
          a: 0.16 + Math.random()*0.09
        });
      }
    } else if(style === 'clouds'){
      // soft, visible gray-toned blobs for bright mode -- deliberately NOT
      // using the accent color, since a light accent disappears on white.
      // Alpha roughly doubled from the first version, which was still too
      // faint to register against white at a glance.
      for(let i=0;i<6;i++){
        particles.push({
          x: Math.random()*w, y: Math.random()*h,
          r: 110 + Math.random()*130,
          vx: (Math.random()-0.5)*0.05,
          vy: (Math.random()-0.5)*0.05,
          alpha: 0.22 + Math.random()*0.14,
          phase: Math.random()*Math.PI*2
        });
      }
    } else if(style === 'pastel-drift'){
      // Redesigned: large soft blurred color blobs that blend into each
      // other (like Clouds, but multi-hued), instead of 30 small hard
      // dots -- the dots read as "a few random bubbles", not a drift.
      const palette = ['#FFB8D9','#B8E0FF','#FFE3A3','#C9F2C0','#E0C3FC'];
      for(let i=0;i<7;i++){
        particles.push({
          x: Math.random()*w, y: Math.random()*h,
          r: 90 + Math.random()*110,
          vx: (Math.random()-0.5)*0.06,
          vy: (Math.random()-0.5)*0.06,
          color: palette[i % palette.length],
          a: 0.22 + Math.random()*0.14,
          phase: Math.random()*Math.PI*2
        });
      }
    } else if(style === 'embers'){
      // Warm, low-motion floating specks for eye-comfort mode. Previous
      // version spawned mostly below the visible canvas (y up to 2h) with
      // tiny size/alpha, so almost nothing was ever on-screen -- fixed to
      // spawn within view, with real size/glow/alpha so they're actually
      // visible while still feeling calm and slow.
      for(let i=0;i<40;i++){
        particles.push({
          x: Math.random()*w, y: Math.random()*(h*1.1),
          r: 2.5 + Math.random()*3.5,
          vy: -(0.09 + Math.random()*0.12),
          drift: Math.random()*0.3,
          t: Math.random()*100,
          a: 0.35 + Math.random()*0.3
        });
      }
    } else if(style === 'snowfall'){
      // small dots drifting straight down, layered for a little depth
      for(let i=0;i<60;i++){
        const layer = Math.random();
        particles.push({
          x: Math.random()*w, y: Math.random()*h,
          r: 0.8 + layer*1.8,
          vy: 0.12 + layer*0.35,
          drift: Math.random()*0.4,
          t: Math.random()*100,
          a: 0.12 + layer*0.28
        });
      }
    } else if(style === 'bubbles'){
      // hollow rings with a tiny glint, rising with a gentle wobble.
      // bubbleBurstStart marks "now" so the draw step can apply a fast
      // initial speed that decays down to the normal speed -- this is what
      // gives the "something just happened" feeling on click, rather than
      // either an instant full-speed jump or a slow fade-in.
      bubbleBurstStart = performance.now();
      for(let i=0;i<24;i++){
        particles.push({
          x: Math.random()*w, y: h + Math.random()*h,
          r: 5 + Math.random()*11,
          vy: -(0.32 + Math.random()*0.5),
          drift: Math.random()*0.4,
          t: Math.random()*100,
          a: 0.10 + Math.random()*0.16
        });
      }
    } else if(style === 'stars'){
      // fixed points that twinkle, occasionally flaring into a soft sparkle
      for(let i=0;i<85;i++){
        particles.push({
          x: Math.random()*w, y: Math.random()*h,
          r: 0.6 + Math.random()*1.1,
          phase: Math.random()*Math.PI*2,
          speed: 0.012 + Math.random()*0.018
        });
      }
    } else if(style === 'waves'){
      // a few flowing horizon lines, not dots at all
      for(let i=0;i<4;i++){
        particles.push({
          baseY: h*(0.22 + i*0.19) + Math.random()*30,
          amp: 12 + Math.random()*14,
          freq: 0.0035 + Math.random()*0.0025,
          phase: Math.random()*Math.PI*2,
          speed: 0.0015 + Math.random()*0.0025,
          a: 0.07 + Math.random()*0.05
        });
      }
    }
  }

  function setParticleStyle(style, skipSave){
    document.querySelectorAll('.swatch-btn').forEach(b => b.classList.toggle('active', b.dataset.style === style));
    initParticles(style);
    if(!skipSave){
      particleStyleByMode[currentMode] = style;
      saveSettings();
    }
  }

  function drawFrame(){
    const {bg, accent, muted} = getThemeColors();
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,canvas.width, canvas.height);
    const w = canvas.width, h = canvas.height;

    if(currentParticleStyle === 'aurora'){
      // 'lighter' makes overlapping ribbons add their colors together --
      // this is what actually produces the blended look, not just stacked
      // transparent shapes.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for(const p of particles){
        p.phase += p.speed;
        p.phase2 += p.speed2;
        const grad = ctx.createLinearGradient(0, p.baseY - p.thickness, 0, p.baseY + p.thickness);
        grad.addColorStop(0, colorWithAlpha(p.color, 0));
        grad.addColorStop(0.5, colorWithAlpha(p.color, p.a));
        grad.addColorStop(1, colorWithAlpha(p.color, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, p.baseY - p.thickness);
        for(let x=0; x<=w; x+=10){
          // sum of two sine waves at different speeds/frequencies --
          // this is what makes the motion read as a genuine undulating
          // wave rather than a single smooth, predictable ripple.
          const y = p.baseY
            + Math.sin(x*p.freq + p.phase)*p.amp
            + Math.sin(x*p.freq2 + p.phase2)*p.amp2;
          ctx.lineTo(x, y - p.thickness);
        }
        for(let x=w; x>=0; x-=10){
          const y = p.baseY
            + Math.sin(x*p.freq + p.phase)*p.amp
            + Math.sin(x*p.freq2 + p.phase2)*p.amp2;
          ctx.lineTo(x, y + p.thickness);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    } else if(currentParticleStyle === 'clouds'){
      for(const p of particles){
        p.x += p.vx; p.y += p.vy; p.phase += 0.002;
        if(p.x < -p.r) p.x = w+p.r; if(p.x > w+p.r) p.x = -p.r;
        if(p.y < -p.r) p.y = h+p.r; if(p.y > h+p.r) p.y = -p.r;
        const pulse = 0.92 + 0.08*Math.sin(p.phase);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r*pulse);
        grad.addColorStop(0, `rgba(120,120,120,${p.alpha})`);
        grad.addColorStop(1, 'rgba(120,120,120,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r*pulse, 0, Math.PI*2);
        ctx.fill();
      }
    } else if(currentParticleStyle === 'pastel-drift'){
      // Soft blurred blobs per color, overlapping -- reads as a drifting
      // pastel wash rather than a handful of flat colored dots.
      for(const p of particles){
        p.x += p.vx; p.y += p.vy; p.phase += 0.0018;
        if(p.x < -p.r) p.x = w+p.r; if(p.x > w+p.r) p.x = -p.r;
        if(p.y < -p.r) p.y = h+p.r; if(p.y > h+p.r) p.y = -p.r;
        const pulse = 0.92 + 0.08*Math.sin(p.phase);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r*pulse);
        grad.addColorStop(0, colorWithAlpha(p.color, p.a));
        grad.addColorStop(1, colorWithAlpha(p.color, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r*pulse, 0, Math.PI*2);
        ctx.fill();
      }
    } else if(currentParticleStyle === 'embers'){
      for(const p of particles){
        p.t += 0.006; p.y += p.vy; p.x += Math.sin(p.t)*p.drift*0.3;
        if(p.y < -p.r-5){ p.y = h+p.r+5; p.x = Math.random()*w; }
        ctx.globalAlpha = p.a;
        ctx.fillStyle = '#FF9A5A';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if(currentParticleStyle === 'snowfall'){
      for(const p of particles){
        p.t += 0.01; p.y += p.vy; p.x += Math.sin(p.t)*p.drift*0.3;
        if(p.y > h+5){ p.y = -5; p.x = Math.random()*w; }
        ctx.globalAlpha = p.a;
        ctx.fillStyle = muted;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if(currentParticleStyle === 'bubbles'){
      // Burst-then-settle: for the first ~1.6s after Bubbles is selected,
      // rise speed is boosted (up to 3x), then eases back down to normal --
      // gives immediate visible motion on click without staying fast forever.
      const burstElapsed = performance.now() - bubbleBurstStart;
      const burstFactor = burstElapsed < 1600 ? 1 + 2 * (1 - burstElapsed / 1600) : 1;
      for(const p of particles){
        p.t += 0.012; p.y += p.vy * burstFactor; p.x += Math.sin(p.t)*p.drift*0.3;
        if(p.y < -p.r-5){ p.y = h+p.r+5; p.x = Math.random()*w; }
        ctx.globalAlpha = p.a;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = accent;
        ctx.arc(p.x - p.r*0.35, p.y - p.r*0.35, Math.max(0.6, p.r*0.16), 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if(currentParticleStyle === 'stars'){
      for(const p of particles){
        p.phase += p.speed;
        const b = Math.abs(Math.sin(p.phase));
        ctx.globalAlpha = 0.12 + 0.45*b;
        ctx.fillStyle = muted;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fill();
        if(b > 0.93){
          const s = p.r*4.2;
          ctx.globalAlpha = (b-0.93)/0.07*0.4;
          ctx.strokeStyle = muted;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(p.x-s, p.y); ctx.lineTo(p.x+s, p.y);
          ctx.moveTo(p.x, p.y-s); ctx.lineTo(p.x, p.y+s);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    } else if(currentParticleStyle === 'waves'){
      for(const p of particles){
        p.phase += p.speed;
        ctx.beginPath();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.1;
        ctx.globalAlpha = p.a;
        for(let x=0; x<=w; x+=10){
          const y = p.baseY + Math.sin(x*p.freq + p.phase)*p.amp;
          if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    requestAnimationFrame(drawFrame);
  }
  requestAnimationFrame(drawFrame);

  // ---------------- text-to-speech reader ----------------
  let availableVoices = [];
  let selectedVoiceName = null;
  let readerState = 'idle'; // idle | playing | paused

  function markdownToSpokenText(src){
    return src
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^>\s?/gm, '')
      .replace(/^[-*]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();
  }

  // Clarity's supported TTS language shortlist. Each entry matches voice.lang
  // prefixes (case-insensitive). "pt" is restricted to Brazilian Portuguese
  // per product decision -- pt-PT voices are intentionally excluded.
  // kokoroVoice: the Kokoro-82M voice id used as the in-browser fallback when
  // no OS voice is installed for that language. NOTE: Kokoro's English
  // voices are well-tested; the other language voice ids below are Kokoro's
  // best current option per language but have NOT been listened to by us --
  // treat them as provisional until manually verified in a real browser.
  const SUPPORTED_LANGS = [
    // CORRECTED after a real-browser test: the actual error returned by this
    // model build (onnx-community/Kokoro-82M-v1.0-ONNX) lists its available
    // voices as af_*/am_* (American) and bf_*/bm_* (British) ONLY -- there
    // is no ff_siwis, pf_dora, ef_dora or zf_xiaobei in this build. Those
    // earlier IDs were wrong guesses, not verified voices. Until we find
    // (and test) a build that genuinely ships non-English voices, the free
    // fallback is English-only.
    { code: 'en', label: 'English',    match: l => l.startsWith('en'), kokoroVoice: 'af_heart' },
    { code: 'fr', label: 'French',     match: l => l.startsWith('fr'), kokoroVoice: null },
    { code: 'pt', label: 'Portuguese (Brazil)', match: l => l.startsWith('pt-br') || l === 'pt_br', kokoroVoice: null },
    { code: 'es', label: 'Spanish',    match: l => l.startsWith('es'), kokoroVoice: null },
    { code: 'de', label: 'German',     match: l => l.startsWith('de'), kokoroVoice: null },
    { code: 'zh', label: 'Mandarin Chinese', match: l => l.startsWith('zh'), kokoroVoice: null },
  ];
  // German: Kokoro-82M has no German voice as of this writing. If a user's
  // OS has no German voice either, we can only show the honest "unavailable"
  // message (Part B) -- there's no free fallback to offer yet.

  // ---- In-browser downloadable voice fallback (Kokoro-82M via kokoro-js) ----
  // Loaded lazily from a CDN only when the user actually clicks "Download
  // free voice", so users who never need it never pay the cost.
  const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
  const KOKORO_CDN = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';
  let kokoroModulePromise = null;
  let kokoroTTSInstance = null;
  const kokoroDownloadState = {}; // langCode -> 'idle' | 'loading' | 'ready' | 'error'

  function loadKokoroModule(){
    if(!kokoroModulePromise) kokoroModulePromise = import(KOKORO_CDN);
    return kokoroModulePromise;
  }

  // Downloads (once) and caches the shared Kokoro model, then marks the
  // requested language ready. The model itself is language-agnostic --
  // only the chosen voice id differs per language -- so we only ever
  // download it once no matter how many fallback languages get used.
  //
  // IMPORTANT: Kokoro/transformers.js loads several separate files
  // (tokenizer config, model config, the ~90MB weights file, etc.) and
  // fires progress_callback once PER FILE, each reporting 0-100% for just
  // that file. The previous version displayed whichever file's progress
  // fired most recently, so a small file finishing at 100% looked like
  // "done" while the real weights file was still loading (or silently
  // failing) behind it -- this tracks combined bytes across every file
  // for one true overall percentage instead.
  async function downloadVoicePack(langCode, onProgress){
    const lang = SUPPORTED_LANGS.find(l => l.code === langCode);
    if(!lang || !lang.kokoroVoice){
      throw new Error('No free fallback voice is available yet for this language.');
    }
    kokoroDownloadState[langCode] = 'loading';
    const fileProgress = {}; // file name -> {loaded, total}
    function aggregateProgress(){
      let loaded = 0, total = 0;
      Object.values(fileProgress).forEach(f => { loaded += f.loaded || 0; total += f.total || 0; });
      return total > 0 ? Math.min(100, (loaded / total) * 100) : 0;
    }
    try{
      const { KokoroTTS } = await loadKokoroModule();
      if(!kokoroTTSInstance){
        kokoroTTSInstance = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
          dtype: 'q8', // ~86MB quantized build -- smallest with no notable quality loss
          device: 'wasm',
          progress_callback: (p) => {
            if(p && p.file){
              fileProgress[p.file] = { loaded: p.loaded || 0, total: p.total || (p.loaded || 0) };
            }
            if(onProgress) onProgress({ status: 'progress', progress: aggregateProgress(), raw: p });
          },
        });
      }
      // Don't trust from_pretrained resolving as proof it actually works --
      // run one real, silent generation first. If this throws, we want to
      // know now, with a real error, not after the UI already said "ready".
      if(onProgress) onProgress({ status: 'progress', progress: 100, verifying: true });
      await kokoroTTSInstance.generate('test', { voice: lang.kokoroVoice });
      kokoroDownloadState[langCode] = 'ready';
      return kokoroTTSInstance;
    } catch(err){
      kokoroDownloadState[langCode] = 'error';
      console.error('Clarity: voice pack download/verification failed for', langCode, err);
      throw err;
    }
  }

  // Generates a playable object URL for the given text using a downloaded
  // Kokoro voice pack. Returns null if the pack isn't downloaded yet.
  async function speakWithVoicePack(langCode, text){
    const lang = SUPPORTED_LANGS.find(l => l.code === langCode);
    if(!kokoroTTSInstance || kokoroDownloadState[langCode] !== 'ready') return null;
    const audio = await kokoroTTSInstance.generate(text, { voice: lang.kokoroVoice });
    const blob = await audio.toBlob();
    return URL.createObjectURL(blob);
  }

  // Rough, cross-browser quality signal: browsers don't expose a real
  // quality score, so we rank by naming hints that tend to mean
  // "higher-quality/online voice" on Windows, macOS, iOS, Android and Chrome.
  const QUALITY_HINTS = ['natural', 'neural', 'enhanced', 'premium', 'online'];
  function voiceQualityScore(v){
    const n = v.name.toLowerCase();
    let score = 0;
    QUALITY_HINTS.forEach(h => { if(n.includes(h)) score += 1; });
    return score;
  }

  function groupVoicesByLanguage(voices){
    const groups = {};
    SUPPORTED_LANGS.forEach(l => groups[l.code] = []);
    voices.forEach(v => {
      const l = (v.lang || '').toLowerCase();
      const lang = SUPPORTED_LANGS.find(sl => sl.match(l));
      if(lang) groups[lang.code].push(v);
    });
    SUPPORTED_LANGS.forEach(l => {
      groups[l.code].sort((a, b) => voiceQualityScore(b) - voiceQualityScore(a));
    });
    return groups;
  }

  let lastGroupedVoices = {};

  function populateVoices(){
    const sel = document.getElementById('voiceSelect');
    const langSel = document.getElementById('languageSelect');
    const status = document.getElementById('voiceStatus');
    if(!('speechSynthesis' in window)){
      sel.innerHTML = '<option value="">Not supported in this browser</option>';
      langSel.innerHTML = '<option value="">Not supported in this browser</option>';
      document.getElementById('btnPlayPause').disabled = true;
      return;
    }
    availableVoices = window.speechSynthesis.getVoices();
    if(!availableVoices.length) return;
    const grouped = groupVoicesByLanguage(availableVoices);
    lastGroupedVoices = grouped;
    sel.innerHTML = '';
    const missing = [];

    // Simple, default view: one entry per language, not per voice. This is
    // what most people see -- the detailed per-voice list (below) is tucked
    // behind "Advanced" since browsers can expose a very different number
    // of raw voices (Firefox in particular tends to list many more regional
    // variants per language than Chrome does for the same installed voices).
    const prevLangValue = langSel.value;
    langSel.innerHTML = '';
    SUPPORTED_LANGS.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.code;
      const hasOS = grouped[l.code] && grouped[l.code].length;
      const hasPack = kokoroDownloadState[l.code] === 'ready';
      opt.textContent = l.label + (!hasOS && !hasPack ? ' (voice needed)' : '');
      langSel.appendChild(opt);
    });

    SUPPORTED_LANGS.forEach(l => {
      const voices = grouped[l.code];
      if(!voices.length){ missing.push(l.label); return; }
      const group = document.createElement('optgroup');
      group.label = l.label;
      voices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = v.name + (voiceQualityScore(v) > 0 ? ' ★' : '');
        group.appendChild(opt);
      });
      sel.appendChild(group);
    });
    if(!sel.options.length){
      sel.innerHTML = '<option value="">No supported-language voices installed</option>';
    }
    if(selectedVoiceName && (availableVoices.some(v => v.name === selectedVoiceName) || selectedVoiceName.startsWith('kokoro:'))){
      if(!selectedVoiceName.startsWith('kokoro:')) sel.value = selectedVoiceName;
    } else if(sel.options.length){
      sel.selectedIndex = 0;
      selectedVoiceName = sel.value;
    } else {
      selectedVoiceName = null;
    }
    // Sync the simple language dropdown to whatever voice is actually active.
    const activeLang = selectedVoiceName && selectedVoiceName.startsWith('kokoro:')
      ? selectedVoiceName.split(':')[1]
      : (availableVoices.find(v => v.name === selectedVoiceName) || {}).lang;
    if(activeLang){
      const match = SUPPORTED_LANGS.find(l => l.code === activeLang || l.match((activeLang||'').toLowerCase()));
      if(match) langSel.value = match.code;
    } else if(prevLangValue){
      langSel.value = prevLangValue;
    }
    lastAutoVoiceName = selectedVoiceName;
    lastAutoLanguageCode = langSel.value;
    if(status){
      status.textContent = missing.length
        ? 'No installed voice for: ' + missing.join(', ') + '.'
        : '';
    }
    renderVoicePackActions(missing.map(label => SUPPORTED_LANGS.find(l => l.label === label)));
  }

  // Default control: picks the best-ranked installed voice for the chosen
  // language, or the downloaded voice pack if that's the only option.
  let lastAutoVoiceName = null; // the voice the simple Language picker auto-chose, for Undo
  let lastAutoLanguageCode = null;

  function onLanguageChange(){
    const code = document.getElementById('languageSelect').value;
    const voices = lastGroupedVoices[code];
    if(voices && voices.length){
      selectedVoiceName = voices[0].name; // already quality-sorted
      const sel = document.getElementById('voiceSelect');
      if(sel) sel.value = selectedVoiceName;
    } else if(kokoroDownloadState[code] === 'ready'){
      selectedVoiceName = 'kokoro:' + code;
    } else {
      selectedVoiceName = null;
    }
    lastAutoVoiceName = selectedVoiceName;
    lastAutoLanguageCode = code;
    const warn = document.getElementById('voiceMismatchWarning');
    if(warn) warn.style.display = 'none';
    saveSettings();
  }

  function toggleAdvancedVoice(e){
    if(e) e.preventDefault();
    const box = document.getElementById('advancedVoiceBox');
    const isHidden = box.style.display === 'none';
    box.style.display = isHidden ? '' : 'none';
    document.getElementById('advancedVoiceToggle').textContent = isHidden
      ? 'Hide specific voice picker'
      : 'Advanced: pick a specific voice';
  }

  // Renders one "Download free voice" button per missing language that has
  // a Kokoro fallback available. Clicking downloads the (shared, one-time)
  // model, then adds that language's voice pack as a selectable option.
  function renderVoicePackActions(missingLangs){
    const box = document.getElementById('voicePackActions');
    if(!box) return;
    box.innerHTML = '';
    missingLangs.forEach(lang => {
      if(!lang) return;
      const state = kokoroDownloadState[lang.code];
      if(state === 'ready') return; // already added as a selectable option below
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.marginRight = '6px';
      btn.style.marginTop = '4px';
      if(!lang.kokoroVoice){
        btn.disabled = true;
        btn.textContent = 'No free voice available for ' + lang.label + ' yet';
      } else if(state === 'loading'){
        btn.disabled = true;
        btn.textContent = 'Downloading ' + lang.label + ' voice… ';
      } else if(state === 'error'){
        btn.textContent = 'Retry ' + lang.label + ' voice download';
      } else {
        btn.textContent = 'Download free ' + lang.label + ' voice (~90MB, one-time)';
      }
      if(lang.kokoroVoice && state !== 'loading'){
        btn.onclick = () => startVoicePackDownload(lang.code);
      }
      box.appendChild(btn);
    });
  }

  async function startVoicePackDownload(langCode){
    const lang = SUPPORTED_LANGS.find(l => l.code === langCode);
    const status = document.getElementById('voiceStatus');
    try{
      await downloadVoicePack(langCode, (p) => {
        if(!status || !p) return;
        if(p.verifying){
          status.textContent = 'Checking ' + lang.label + ' voice works…';
        } else {
          status.textContent = 'Downloading ' + lang.label + ' voice… ' + Math.round(p.progress || 0) + '%'
            + ' (this is an in-page download, not a browser file download -- it won\'t show in your downloads bar)';
        }
      });
      // Add the freshly downloaded pack as a selectable voice.
      const sel = document.getElementById('voiceSelect');
      const opt = document.createElement('option');
      opt.value = 'kokoro:' + langCode;
      opt.textContent = lang.label + ' (downloaded voice) ★';
      sel.appendChild(opt);
      sel.value = opt.value;
      selectedVoiceName = opt.value;
      const langSel = document.getElementById('languageSelect');
      if(langSel){
        const langOpt = Array.from(langSel.options).find(o => o.value === langCode);
        if(langOpt) langOpt.textContent = lang.label;
        langSel.value = langCode;
      }
      saveSettings();
      if(status) status.textContent = lang.label + ' voice downloaded and verified working.';
    } catch(err){
      // Show the REAL error instead of a generic message -- a silent
      // "try again" message is exactly what made this impossible to debug
      // last time.
      const reason = (err && err.message) ? err.message : String(err);
      if(status) status.textContent = 'Could not set up ' + lang.label + ' voice: ' + reason + ' (see browser console for details)';
    }
    renderVoicePackActions(SUPPORTED_LANGS.filter(l => kokoroDownloadState[l.code] !== 'ready'));
  }

  if('speechSynthesis' in window){
    populateVoices();
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }

  function onVoiceChange(){
    selectedVoiceName = document.getElementById('voiceSelect').value;
    const warn = document.getElementById('voiceMismatchWarning');
    const langCode = document.getElementById('languageSelect').value;
    const voice = availableVoices.find(v => v.name === selectedVoiceName);
    const matchesCurrentLang = voice && SUPPORTED_LANGS.find(l => l.code === langCode && l.match((voice.lang||'').toLowerCase()));
    if(warn){
      if(voice && !matchesCurrentLang){
        warn.style.display = '';
        warn.textContent = 'This voice doesn\'t match your selected language (' +
          (SUPPORTED_LANGS.find(l=>l.code===langCode)||{}).label + ') -- it may not sound right.';
      } else {
        warn.style.display = 'none';
      }
    }
    saveSettings();
  }

  // Reverts any manual pick made in the Advanced voice list back to
  // whatever the simple Language picker had auto-selected.
  function undoAdvancedVoiceChoice(){
    if(lastAutoLanguageCode){
      document.getElementById('languageSelect').value = lastAutoLanguageCode;
    }
    selectedVoiceName = lastAutoVoiceName;
    const sel = document.getElementById('voiceSelect');
    if(sel && selectedVoiceName && !selectedVoiceName.startsWith('kokoro:')) sel.value = selectedVoiceName;
    const warn = document.getElementById('voiceMismatchWarning');
    if(warn) warn.style.display = 'none';
    saveSettings();
    const status = document.getElementById('voiceStatus');
    if(status) status.textContent = 'Reverted to the automatic voice choice.';
  }

  function onRateChange(skipSave){
    const v = document.getElementById('rateRange').value;
    document.getElementById('rateVal').textContent = (v/100).toFixed(2) + 'x';
    if(!skipSave) saveSettings();
  }

  function getSelectedVoice(){
    return availableVoices.find(v => v.name === selectedVoiceName) || availableVoices[0] || null;
  }

  function toggleReading(){
    const usingVoicePack = (selectedVoiceName || '').startsWith('kokoro:');
    if(usingVoicePack) return toggleReadingWithVoicePack();
    if(!('speechSynthesis' in window)){
      document.getElementById('readerStatus').textContent = 'Reading aloud isn\'t supported in this browser.';
      return;
    }
    if(readerState === 'playing'){
      window.speechSynthesis.pause();
      readerState = 'paused';
      document.getElementById('btnPlayPause').textContent = '▶ Play';
      document.getElementById('readerStatus').textContent = 'Paused.';
      return;
    }
    if(readerState === 'paused'){
      window.speechSynthesis.resume();
      readerState = 'playing';
      document.getElementById('btnPlayPause').textContent = '⏸ Pause';
      document.getElementById('readerStatus').textContent = 'Reading aloud…';
      return;
    }
    const text = markdownToSpokenText(editor.value.trim());
    if(!text){ document.getElementById('readerStatus').textContent = 'Nothing to read yet.'; return; }
    const utter = new SpeechSynthesisUtterance(text);
    const voice = getSelectedVoice();
    if(voice) utter.voice = voice;
    utter.rate = parseInt(document.getElementById('rateRange').value) / 100;
    utter.onend = () => {
      readerState = 'idle';
      document.getElementById('btnPlayPause').textContent = '▶ Play';
      document.getElementById('readerStatus').textContent = 'Finished reading.';
    };
    utter.onerror = () => {
      readerState = 'idle';
      document.getElementById('btnPlayPause').textContent = '▶ Play';
      document.getElementById('readerStatus').textContent = 'Could not read aloud.';
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
    readerState = 'playing';
    document.getElementById('btnPlayPause').textContent = '⏸ Pause';
    document.getElementById('readerStatus').textContent = 'Reading aloud…';
  }

  // Playback path for a downloaded Kokoro voice pack. Uses a plain <audio>
  // element instead of speechSynthesis, since the audio is a generated
  // sound file, not a system voice call.
  async function toggleReadingWithVoicePack(){
    const langCode = selectedVoiceName.split(':')[1];
    const audioEl = document.getElementById('kokoroAudio');
    const statusEl = document.getElementById('readerStatus');
    if(readerState === 'playing'){
      audioEl.pause();
      readerState = 'paused';
      document.getElementById('btnPlayPause').textContent = '▶ Play';
      statusEl.textContent = 'Paused.';
      return;
    }
    if(readerState === 'paused' && audioEl.src){
      audioEl.play();
      readerState = 'playing';
      document.getElementById('btnPlayPause').textContent = '⏸ Pause';
      statusEl.textContent = 'Reading aloud…';
      return;
    }
    const text = markdownToSpokenText(editor.value.trim());
    if(!text){ statusEl.textContent = 'Nothing to read yet.'; return; }
    statusEl.textContent = 'Generating speech…';
    try{
      const url = await speakWithVoicePack(langCode, text);
      if(!url) throw new Error('Voice pack not ready.');
      audioEl.src = url;
      audioEl.playbackRate = parseInt(document.getElementById('rateRange').value) / 100;
      audioEl.onended = () => {
        readerState = 'idle';
        document.getElementById('btnPlayPause').textContent = '▶ Play';
        statusEl.textContent = 'Finished reading.';
      };
      await audioEl.play();
      readerState = 'playing';
      document.getElementById('btnPlayPause').textContent = '⏸ Pause';
      statusEl.textContent = 'Reading aloud…';
    } catch(err){
      readerState = 'idle';
      statusEl.textContent = 'Could not generate speech for this voice pack.';
    }
  }

  function stopReading(){
    if((selectedVoiceName || '').startsWith('kokoro:')){
      const audioEl = document.getElementById('kokoroAudio');
      audioEl.pause();
      audioEl.currentTime = 0;
      readerState = 'idle';
      document.getElementById('btnPlayPause').textContent = '▶ Play';
      document.getElementById('readerStatus').textContent = 'Stopped.';
      return;
    }
    if(!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    readerState = 'idle';
    document.getElementById('btnPlayPause').textContent = '▶ Play';
    document.getElementById('readerStatus').textContent = 'Stopped.';
  }

  // ---------------- shortcuts modal ----------------
  function toggleShortcuts(force){
    const modal = document.getElementById('shortcutsModal');
    const open = typeof force === 'boolean' ? force : !modal.classList.contains('open');
    modal.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  }
  document.getElementById('shortcutsModal').addEventListener('click', (e) => {
    if(e.target.id === 'shortcutsModal') toggleShortcuts(false);
  });

  document.addEventListener('keydown', function(e){
    const mod = e.ctrlKey || e.metaKey;
    const inField = ['TEXTAREA','INPUT'].includes(e.target.tagName);

    if(mod && !e.shiftKey && e.key.toLowerCase() === 's'){ e.preventDefault(); saveDoc(); }
    else if(mod && e.key.toLowerCase() === 'n'){ e.preventDefault(); newDoc(); }
    else if(mod && !e.shiftKey && e.key.toLowerCase() === 'p'){ e.preventDefault(); exportPDF(); }
    else if(mod && e.shiftKey && e.key.toLowerCase() === 'd'){ e.preventDefault(); downloadText(); }
    else if(mod && e.shiftKey && e.key.toLowerCase() === 'm'){ e.preventDefault(); downloadMarkdown(); }
    else if(mod && e.shiftKey && e.key.toLowerCase() === 'l'){ e.preventDefault(); toggleReading(); }
    else if(mod && e.key.toLowerCase() === 'e'){ e.preventDefault(); setViewMode(viewMode==='edit'?'preview':'edit'); }
    else if(mod && e.key === '1'){ e.preventDefault(); setMode('dark'); }
    else if(mod && e.key === '2'){ e.preventDefault(); setMode('bright'); }
    else if(mod && e.key === '3'){ e.preventDefault(); setMode('eye'); }
    else if(!inField && e.key === '?'){ e.preventDefault(); toggleShortcuts(); }
    else if(e.key === 'Escape'){ toggleShortcuts(false); }
  });

  // ---------------- init ----------------
  async function init(){
    updateType(true);
    updateContrast();
    updateWordCount();
    await loadSettings();
    await renderDocList();
    const draft = await storeGet('draft');
    if(draft && (draft.content || draft.title)){
      editor.value = draft.content || '';
      document.getElementById('docTitle').value = draft.title || '';
      currentDocId = draft.docId || null;
      updateWordCount();
      document.getElementById('saveStatus').textContent = 'Restored your last draft.';
      renderDocList();
    }
  }
  init();
