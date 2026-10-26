/* ==========================================================
   Sync: sincronización en tiempo real entre dispositivos (Supabase).

   El estado de cada empresa se guarda como registros independientes
   (meta, cada pedido, cada comprobante, cada producto) en la tabla
   `registros`. Así, la cocina marcando un pedido y la caja emitiendo
   otro no se pisan entre sí.

   - Al abrir: descarga los registros de la sala/empresa (o los siembra
     si la sala está vacía).
   - Al guardar: envía sólo los registros que cambiaron.
   - En vivo: recibe los cambios de otros dispositivos por Realtime.
   ========================================================== */
const Sync = (() => {
  const cfg = window.BACKEND || {};
  const activo = !!(cfg.url && cfg.anonKey && window.supabase);
  const TABLA = 'registros';
  const autor = U.uid(); // identifica a esta pestaña para ignorar sus propios ecos
  let client = null;
  let listo = false;
  let estado = activo ? 'conectando' : 'local';
  let snap = new Map(); // clave -> JSON del registro tal como está en el servidor
  let cola = Promise.resolve();
  let reintento = null;

  const sala = () => Store.salaId();
  const negocio = () => Store.activoId();
  const clave = (tipo, id) => tipo + ':' + id;

  /* ---------- Conversión estado <-> registros ---------- */
  function partir(d) {
    const m = new Map();
    const { pedidos, comprobantes, productos, ...meta } = d;
    m.set(clave('meta', 'meta'), { tipo: 'meta', id: 'meta', data: meta });
    (pedidos || []).forEach(p => m.set(clave('pedido', p.id), { tipo: 'pedido', id: p.id, data: p }));
    (comprobantes || []).forEach(c => m.set(clave('comprobante', c.id), { tipo: 'comprobante', id: c.id, data: c }));
    (productos || []).forEach((p, i) => m.set(clave('producto', p.id), { tipo: 'producto', id: p.id, data: { ...p, _i: i } }));
    return m;
  }
  const ordenar = d => {
    d.pedidos.sort((a, b) => new Date(b.tiempos.creado) - new Date(a.tiempos.creado));
    d.comprobantes.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    d.productos.sort((a, b) => (a._i ?? 0) - (b._i ?? 0));
  };
  function armar(rows) {
    const meta = rows.find(r => r.tipo === 'meta');
    if (!meta) return null;
    const d = { ...meta.data, pedidos: [], comprobantes: [], productos: [] };
    rows.forEach(r => {
      if (r.tipo === 'pedido') d.pedidos.push(r.data);
      if (r.tipo === 'comprobante') d.comprobantes.push(r.data);
      if (r.tipo === 'producto') d.productos.push(r.data);
    });
    ordenar(d);
    return d;
  }
  /** Aplica un registro remoto sobre el estado local */
  function aplicar(d, tipo, id, data) {
    if (tipo === 'meta') {
      if (!data) return;
      const { pedidos, comprobantes, productos } = d;
      Object.keys(d).forEach(k => delete d[k]);
      Object.assign(d, data, { pedidos, comprobantes, productos });
      return;
    }
    const lista = { pedido: d.pedidos, comprobante: d.comprobantes, producto: d.productos }[tipo];
    if (!lista) return;
    const i = lista.findIndex(x => x.id === id);
    if (!data) { if (i >= 0) lista.splice(i, 1); }
    else if (i >= 0) lista[i] = data;
    else lista.push(data);
    ordenar(d);
  }

  /* ---------- Estado de conexión (indicador en la barra) ---------- */
  function setEstado(e) { estado = e; pintar(); }
  function pintar() {
    const el = document.getElementById('sync-chip');
    if (!el) return;
    const t = {
      local: ['chip', '💻 Local', 'Sin backend: sincroniza solo entre pestañas de este navegador'],
      conectando: ['chip warn', '⏳', 'Conectando con el servidor'],
      online: ['chip ok', `🟢 ${sala()}`, 'Sincronizado en tiempo real con todos los dispositivos de esta sala'],
      error: ['chip bad', '🔴 Offline', 'Los cambios se guardan aquí y se enviarán al reconectar'],
    }[estado];
    el.className = t[0]; el.textContent = t[1]; el.title = t[2];
  }

  /* ---------- Envío de cambios ---------- */
  function push(d) {
    if (!activo || !listo || d.id !== negocio()) return;
    const m = partir(d);
    const upserts = [], borrar = [];
    m.forEach((r, k) => {
      const json = JSON.stringify(r.data);
      if (snap.get(k) !== json) { upserts.push(r); snap.set(k, json); }
    });
    [...snap.keys()].forEach(k => { if (!m.has(k)) { borrar.push(k); snap.delete(k); } });
    if (!upserts.length && !borrar.length) return;
    const s = sala(), n = negocio();
    cola = cola.then(async () => {
      try {
        if (upserts.length) {
          const filas = upserts.map(r => ({ sala: s, negocio: n, tipo: r.tipo, id: r.id, data: r.data, autor, updated_at: new Date().toISOString() }));
          for (let i = 0; i < filas.length; i += 200) {
            const { error } = await client.from(TABLA).upsert(filas.slice(i, i + 200));
            if (error) throw error;
          }
        }
        for (const k of borrar) {
          const [tipo, ...rest] = k.split(':');
          const { error } = await client.from(TABLA).delete().match({ sala: s, negocio: n, tipo, id: rest.join(':') });
          if (error) throw error;
        }
        if (estado !== 'online') setEstado('online');
      } catch (e) {
        console.error('Sync push', e);
        // olvidar lo enviado para que se reintente en el próximo guardado
        upserts.forEach(r => snap.delete(clave(r.tipo, r.id)));
        borrar.forEach(k => snap.set(k, '__pendiente__'));
        setEstado('error');
        clearTimeout(reintento);
        reintento = setTimeout(() => push(Store.get()), 4000);
      }
    });
  }

  /* ---------- Descarga inicial ---------- */
  async function pull() {
    const s = sala(), n = negocio();
    let rows = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await client.from(TABLA).select('tipo,id,data').match({ sala: s, negocio: n }).range(desde, desde + 999);
      if (error) throw error;
      rows = rows.concat(data);
      if (data.length < 1000) break;
    }
    const remoto = armar(rows);
    if (!remoto) {
      // Sala vacía: se siembra con los datos actuales de este navegador
      snap = new Map();
      listo = true;
      push(Store.get());
      await cola; // esperar a que termine la siembra
      return;
    }
    snap = new Map(rows.map(r => [clave(r.tipo, r.id), JSON.stringify(r.data)]));
    listo = true;
    Store._remoto(remoto);
  }

  /* ---------- Cambios en vivo ---------- */
  function alCambiar(payload) {
    const nuevo = payload.new && payload.new.sala ? payload.new : null;
    const viejo = payload.old || {};
    const fila = nuevo || viejo;
    if (!fila || fila.sala !== sala() || fila.negocio !== negocio()) return;
    if (nuevo && nuevo.autor === autor) return; // eco de esta misma pestaña
    const k = clave(fila.tipo, fila.id);
    const data = payload.eventType === 'DELETE' ? null : nuevo.data;
    if (data) snap.set(k, JSON.stringify(data)); else snap.delete(k);
    const d = Store.get();
    aplicar(d, fila.tipo, fila.id, data);
    Store._remoto(d);
  }

  function suscribir() {
    let primeraVez = true;
    client.channel('simpos-' + sala())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLA, filter: `sala=eq.${sala()}` }, alCambiar)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: TABLA, filter: `sala=eq.${sala()}` }, alCambiar)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: TABLA }, alCambiar)
      .subscribe(st => {
        if (st === 'SUBSCRIBED') {
          // tras una reconexión se descargan los cambios que se perdieron
          if (!primeraVez && listo) resincronizar();
          primeraVez = false;
        }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') setEstado('error');
      });
  }

  async function resincronizar() {
    try { await cola; await pull(); setEstado('online'); }
    catch (e) { console.error('Sync pull', e); setEstado('error'); }
  }

  /* ---------- Arranque ---------- */
  async function init() {
    pintar();
    if (!activo) return;
    const velo = document.createElement('div');
    velo.className = 'modal-back';
    velo.innerHTML = `<div class="card card-pad" style="text-align:center;min-width:260px"><div style="font-size:34px">🔄</div>
      <b>Conectando con el servidor…</b><div class="muted small">Sala: ${U.esc(sala())}</div></div>`;
    document.body.appendChild(velo);
    const quitar = () => velo.remove();
    setTimeout(quitar, 8000);
    try {
      client = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
      suscribir();
      await pull();
      setEstado('online');
    } catch (e) {
      console.error('Sync init', e);
      setEstado('error');
      U.toast('No se pudo conectar al servidor: se trabaja en modo local', 'warn');
      clearTimeout(reintento);
      reintento = setTimeout(init, 10000);
    }
    quitar();
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && listo) resincronizar(); });
  window.addEventListener('online', () => { if (listo) resincronizar(); });

  /** Borra la empresa de la sala en el servidor (reiniciar demo) */
  async function borrarTodo() {
    if (!activo || !client) return;
    await client.from(TABLA).delete().match({ sala: sala(), negocio: negocio() });
    snap = new Map();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init);

  return { push, pintar, borrarTodo, get activo() { return activo; }, get estado() { return estado; } };
})();
