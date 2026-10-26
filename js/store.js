/* ==========================================================
   Store: estado compartido entre pantallas.
   Se guarda en localStorage (caché local) y se sincroniza:
   - entre pestañas del mismo navegador (BroadcastChannel + storage);
   - entre dispositivos vía backend (js/sync.js), si está configurado.
   Cada "sala" es un espacio de datos independiente (?sala=codigo),
   útil para dar a cada empresa interesada su propia demo.
   ========================================================== */
const Store = (() => {
  const KEY_ACTIVO = 'simpos:negocio';
  const KEY_SALA = 'simpos:sala';
  const keyData = id => `simpos:data:${salaId()}:${id}`;
  const listeners = [];
  let lastRaw = null;
  let bc = null;

  function salaId() {
    const p = (new URLSearchParams(location.search).get('sala') || '').trim().toLowerCase();
    if (/^[a-z0-9-]{3,40}$/.test(p)) { localStorage.setItem(KEY_SALA, p); return p; }
    return localStorage.getItem(KEY_SALA) || 'demo';
  }

  function activoId() {
    const p = new URLSearchParams(location.search).get('negocio');
    if (p && DEMO[p]) { localStorage.setItem(KEY_ACTIVO, p); return p; }
    const id = localStorage.getItem(KEY_ACTIVO);
    return DEMO[id] ? id : 'ceviche';
  }

  function nuevoNegocio(id) {
    const base = JSON.parse(JSON.stringify(DEMO[id]));
    return Object.assign(base, {
      version: 1,
      correlativos: {},
      pedidos: [],
      comprobantes: [],
      contador: { fecha: '', n: 0 },
      caja: { abierta: false, sesion: null, historial: [] },
      productos: base.productos.map(p => Object.assign({ activo: true, stock: null, opciones: [], unidad: 'NIU' }, p)),
    });
  }

  function leer(id) {
    const raw = localStorage.getItem(keyData(id));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function get() {
    const id = activoId();
    let d = leer(id);
    if (!d) { d = nuevoNegocio(id); escribir(d, false); }
    return d;
  }

  function escribir(d, avisar = true) {
    const raw = JSON.stringify(d);
    localStorage.setItem(keyData(d.id), raw);
    if (d.id === activoId()) lastRaw = raw;
    if (avisar) {
      try { bc && bc.postMessage({ id: d.id, t: Date.now() }); } catch (e) { /* noop */ }
      emitir();
    }
  }

  /** Guarda y notifica, enviando además los cambios al backend */
  function guardar(d) {
    escribir(d);
    if (typeof Sync !== 'undefined') Sync.push(d);
  }

  /** Lee el estado más reciente, aplica la mutación y guarda. */
  function update(fn) {
    const d = get();
    const r = fn(d);
    guardar(d);
    return r === undefined ? d : r;
  }

  function emitir() { const d = get(); listeners.forEach(cb => { try { cb(d); } catch (e) { console.error(e); } }); }

  function subscribe(cb) { listeners.push(cb); }

  function revisar() {
    const raw = localStorage.getItem(keyData(activoId()));
    if (raw !== lastRaw) { lastRaw = raw; emitir(); }
  }

  try { bc = new BroadcastChannel('simpos'); bc.onmessage = revisar; } catch (e) { bc = null; }
  window.addEventListener('storage', e => { if (!e.key || e.key.startsWith('simpos:')) revisar(); });
  setInterval(revisar, 1500);

  return {
    activoId,
    salaId,
    get,
    update,
    subscribe,
    setActivo(id) { localStorage.setItem(KEY_ACTIVO, id); },
    empresaDe(id) { const d = leer(id); return (d || DEMO[id]).empresa; },
    setSala(codigo) { localStorage.setItem(KEY_SALA, codigo); },
    /** Estado recibido del servidor: se guarda localmente sin reenviarlo */
    _remoto(d) { escribir(d); },
    async reset(id) {
      if (typeof Sync !== 'undefined') await Sync.borrarTodo();
      localStorage.removeItem(keyData(id || activoId())); lastRaw = null;
    },
    exportar() { return JSON.stringify(get(), null, 2); },
    importar(json) {
      const d = JSON.parse(json);
      if (!d.id || !DEMO[d.id]) throw new Error('Archivo no válido');
      if (d.id !== activoId()) throw new Error('El respaldo es de otra empresa: cámbiala primero en el selector');
      guardar(d);
    },

    /* ---------- Reglas de negocio compartidas ---------- */
    siguienteCorrelativo(d, serie) {
      d.correlativos[serie] = (d.correlativos[serie] || 0) + 1;
      return d.correlativos[serie];
    },
    /** Número de pedido diario (se reinicia cada día) */
    siguientePedido(d) {
      const hoy = U.fechaISO(new Date());
      if (d.contador.fecha !== hoy) d.contador = { fecha: hoy, n: 0 };
      d.contador.n += 1;
      return d.contador.n;
    },
    estacionDe(d, producto) {
      if (producto.sinPreparacion) return null;
      const cat = d.categorias.find(c => c.id === producto.categoria);
      return cat ? cat.estacion : (d.estaciones[0] && d.estaciones[0].id);
    },
    /** Recalcula el estado del pedido a partir de sus ítems */
    recalcularEstado(p) {
      if (p.estado === 'anulado' || p.estado === 'entregado') return p.estado;
      const prep = p.items.filter(i => i.estacion);
      if (!prep.length || prep.every(i => i.listo)) {
        if (p.estado !== 'listo') { p.estado = 'listo'; p.tiempos.listo = new Date().toISOString(); }
      } else if (prep.some(i => i.listo) || p.tiempos.preparacion) {
        p.estado = 'preparacion';
        p.tiempos.preparacion = p.tiempos.preparacion || new Date().toISOString();
      } else {
        p.estado = 'pendiente';
      }
      return p.estado;
    },
  };
})();
