/* ==========================================================
   Utilidades compartidas (formato, validaciones, UI)
   ========================================================== */
const U = {
  r2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; },
  f2(n) { return Number(n || 0).toFixed(2); },
  money(n) { return 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
  pad(n, len) { return String(n).padStart(len, '0'); },
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  fecha(d) { d = new Date(d); return `${U.pad(d.getDate(), 2)}/${U.pad(d.getMonth() + 1, 2)}/${d.getFullYear()}`; },
  fechaISO(d) { d = new Date(d); return `${d.getFullYear()}-${U.pad(d.getMonth() + 1, 2)}-${U.pad(d.getDate(), 2)}`; },
  hora(d, seg = true) { d = new Date(d); return `${U.pad(d.getHours(), 2)}:${U.pad(d.getMinutes(), 2)}` + (seg ? `:${U.pad(d.getSeconds(), 2)}` : ''); },
  mmss(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${U.pad(Math.floor(s / 60), 2)}:${U.pad(s % 60, 2)}`;
  },
  qs(sel, el = document) { return el.querySelector(sel); },
  qsa(sel, el = document) { return [...el.querySelectorAll(sel)]; },
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  param(name) { return new URLSearchParams(location.search).get(name); },

  /* Hash determinístico (simula el DigestValue de la firma XML) */
  hash(str) {
    const h = seed => {
      let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
      for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
      return [h1 >>> 0, h2 >>> 0];
    };
    const words = [...h(1), ...h(2), ...h(3)].slice(0, 5);
    let bin = '';
    words.forEach(w => { for (let i = 3; i >= 0; i--) bin += String.fromCharCode((w >>> (i * 8)) & 255); });
    return btoa(bin);
  },

  /* ---------- Validaciones Perú ---------- */
  validarRUC(ruc) {
    ruc = String(ruc || '').trim();
    if (!/^(10|15|17|20)\d{9}$/.test(ruc)) return false;
    const w = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((a, p, i) => a + p * Number(ruc[i]), 0);
    let dv = 11 - (s % 11);
    if (dv === 10) dv = 0; else if (dv === 11) dv = 1;
    return dv === Number(ruc[10]);
  },
  validarDNI(dni) { return /^\d{8}$/.test(String(dni || '').trim()); },
  validarCE(ce) { return /^[A-Za-z0-9]{8,12}$/.test(String(ce || '').trim()); },

  /* ---------- Número a letras (leyenda SUNAT "SON: ...") ---------- */
  numeroALetras(monto, moneda = 'SOLES') {
    const entero = Math.floor(U.r2(monto));
    const cent = Math.round((U.r2(monto) - entero) * 100);
    return `${U._letras(entero).toUpperCase()} CON ${U.pad(cent, 2)}/100 ${moneda}`;
  },
  _letras(n) {
    const un = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
    const de = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
    const ce = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
    const menorMil = x => {
      if (x === 100) return 'cien';
      const c = Math.floor(x / 100), r = x % 100;
      let s = ce[c];
      if (r) s += (s ? ' ' : '') + (r < 30 ? un[r] : de[Math.floor(r / 10)] + (r % 10 ? ' y ' + un[r % 10] : ''));
      return s;
    };
    const apocope = s => s.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');
    if (n === 0) return 'cero';
    const mill = Math.floor(n / 1e6), miles = Math.floor((n % 1e6) / 1000), resto = n % 1000;
    let s = '';
    if (mill) s += mill === 1 ? 'un millón' : apocope(menorMil(mill)) + ' millones';
    if (miles) s += (s ? ' ' : '') + (miles === 1 ? 'mil' : apocope(menorMil(miles)) + ' mil');
    if (resto) s += (s ? ' ' : '') + menorMil(resto);
    return s;
  },

  /* ---------- Totales (precios incluyen IGV) ---------- */
  calcularTotales(items, descuento, config) {
    const tasa = (Number(config.igv) || 0) / 100;
    const bruto = U.r2(items.reduce((a, it) => a + it.precio * it.cantidad, 0));
    const desc = Math.min(U.r2(descuento || 0), bruto);
    const totalIgv = U.r2(bruto - desc);
    const gravada = U.r2(totalIgv / (1 + tasa));
    const igv = U.r2(totalIgv - gravada);
    const bolsas = items.reduce((a, it) => a + (it.icbper ? it.cantidad : 0), 0);
    const icbper = U.r2(bolsas * (Number(config.icbper) || 0));
    return { bruto, descuento: desc, gravada, igv, icbper, total: U.r2(totalIgv + icbper) };
  },

  /* ---------- Sonido y voz ---------- */
  _ctx: null,
  beep(tipo = 'nuevo') {
    try {
      U._ctx = U._ctx || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = U._ctx;
      const notas = { nuevo: [880, 1175], listo: [659, 880, 1319], error: [220, 180], print: [] }[tipo] || [880];
      notas.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        const t = ctx.currentTime + i * 0.16;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        o.connect(g).connect(ctx.destination);
        o.start(t); o.stop(t + 0.3);
      });
    } catch (e) { /* sin audio */ }
  },
  /* ruido corto tipo impresora térmica */
  printSound(ms = 1800) {
    try {
      U._ctx = U._ctx || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = U._ctx, len = Math.floor(ctx.sampleRate * ms / 1000);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (Math.sin(i / 90) > 0 ? 0.35 : 0.08);
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = 2400; g.gain.value = 0.18;
      src.buffer = buf; src.connect(f).connect(g).connect(ctx.destination); src.start();
    } catch (e) { /* sin audio */ }
  },
  hablar(texto) {
    try {
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = 'es-PE'; u.rate = 0.95;
      const voz = speechSynthesis.getVoices().find(v => v.lang.startsWith('es'));
      if (voz) u.voice = voz;
      speechSynthesis.speak(u);
    } catch (e) { /* sin voz */ }
  },

  /* ---------- Toasts y modales ---------- */
  toast(msg, tipo = '') {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + tipo; t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2600);
    setTimeout(() => t.remove(), 3000);
  },

  /**
   * Modal genérico.
   * opts: { title, body (html), wide, actions: [{label, cls, onClick(close, root) -> false para no cerrar}], onMount(root, close), onClose }
   */
  modal(opts) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head"><h3>${opts.title || ''}</h3><span class="spacer"></span>
          <button class="icon-btn" data-x aria-label="Cerrar">✕</button></div>
        <div class="modal-body">${opts.body || ''}</div>
        ${opts.actions && opts.actions.length ? '<div class="modal-foot"></div>' : ''}
      </div>`;
    const root = back.querySelector('.modal');
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); opts.onClose && opts.onClose(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', e => { if (e.target === back && !opts.sticky) close(); });
    root.querySelector('[data-x]').onclick = close;
    const foot = root.querySelector('.modal-foot');
    (opts.actions || []).forEach(a => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.cls || '');
      b.innerHTML = a.label;
      if (a.id) b.id = a.id;
      b.onclick = async () => { const r = await a.onClick?.(close, root); if (r !== false) close(); };
      foot.appendChild(b);
    });
    document.body.appendChild(back);
    opts.onMount && opts.onMount(root, close);
    return { close, root };
  },
  confirmar(titulo, texto, label = 'Confirmar', cls = 'primary') {
    return new Promise(res => {
      let ok = false;
      U.modal({
        title: titulo, body: `<p>${texto}</p>`,
        actions: [{ label: 'Cancelar' }, { label, cls, onClick: () => { ok = true; } }],
        onClose: () => res(ok),
      });
    });
  },
  descargar(nombre, contenido, tipo = 'application/json') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
};

/* ==========================================================
   Barra superior común a todas las pantallas
   ========================================================== */
const UI = {
  paginas(D) {
    return [
      { id: 'inicio', href: 'index.html', label: 'Inicio' },
      { id: 'pos', href: 'pos.html', label: '🧾 Pedidos y cobro' },
      { id: 'cocina', href: 'cocina.html', label: `${D.textos.icono} ${D.textos.produccion}` },
      { id: 'mostrador', href: 'mostrador.html', label: '📺 Mostrador' },
      { id: 'caja', href: 'caja.html', label: '💰 Caja' },
      { id: 'dashboard', href: 'dashboard.html', label: '📊 Dashboard' },
      { id: 'config', href: 'config.html', label: '⚙️ Config' },
    ];
  },
  topbar(activa, extra = '') {
    const D = Store.get();
    document.documentElement.style.setProperty('--accent', D.empresa.color);
    document.title = `${UI.paginas(D).find(p => p.id === activa)?.label.replace(/^\S+\s/, '') || 'Simulador'} · ${D.empresa.nombreComercial}`;
    let bar = document.querySelector('header.topbar');
    if (!bar) { bar = document.createElement('header'); bar.className = 'topbar'; document.body.prepend(bar); }
    const opts = Object.values(DEMO).map(n => `<option value="${n.id}" ${n.id === D.id ? 'selected' : ''}>${n.empresa.logo} ${U.esc(Store.empresaDe(n.id).nombreComercial)}</option>`).join('');
    bar.innerHTML = `
      <a class="brand" href="index.html"><span class="logo">${D.empresa.logo}</span>
        <span>${U.esc(D.empresa.nombreComercial)}<small>RUC ${D.empresa.ruc}</small></span></a>
      <nav class="nav">${UI.paginas(D).map(p => `<a href="${p.href}" class="${p.id === activa ? 'active' : ''}">${p.label}</a>`).join('')}</nav>
      <span class="spacer"></span>
      ${extra}
      <span class="chip" id="sync-chip"></span>
      <span class="sim-badge" title="Los comprobantes no tienen validez tributaria">MODO SIMULACIÓN</span>
      <select id="sel-negocio" title="Cambiar de empresa">${opts}</select>
      <span class="clock" id="clock"></span>`;
    if (typeof Sync !== 'undefined') Sync.pintar();
    bar.querySelector('#sel-negocio').onchange = e => { Store.setActivo(e.target.value); location.reload(); };
    const tick = () => { const c = document.getElementById('clock'); if (c) c.textContent = U.hora(new Date()); };
    tick(); clearInterval(UI._clk); UI._clk = setInterval(tick, 1000);
  },
  pantallaCompleta() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  },
};
