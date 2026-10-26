/* ==========================================================
   Cocina / Despacho — pantalla de producción (KDS)
   ========================================================== */
let D = Store.get();
let estacion = U.param('estacion') || localStorage.getItem('simpos:estacion:' + D.id) || 'todas';
if (estacion !== 'todas' && !D.estaciones.some(s => s.id === estacion)) estacion = 'todas';
let sonido = false;
const vistos = new Set(D.pedidos.map(p => p.id + ':' + p.items.length));
const nuevosFlash = new Set();
const AVISO_MIN = 10, TARDE_MIN = 20;

const $ = id => document.getElementById(id);
const deEstacion = i => i.estacion && (estacion === 'todas' || i.estacion === estacion);
const activos = () => D.pedidos
  .filter(p => (p.estado === 'pendiente' || p.estado === 'preparacion') && p.items.some(i => deEstacion(i) && !i.listo))
  .sort((a, b) => new Date(a.tiempos.creado) - new Date(b.tiempos.creado));

function renderEstaciones() {
  if (D.estaciones.length < 2) { $('estaciones').classList.add('hidden'); estacion = 'todas'; return; }
  const ests = [{ id: 'todas', nombre: 'Todas' }, ...D.estaciones];
  $('estaciones').innerHTML = ests.map(s => `<button data-s="${s.id}" class="${s.id === estacion ? 'on' : ''}">${U.esc(s.nombre)}</button>`).join('');
  U.qsa('#estaciones button').forEach(b => b.onclick = () => {
    estacion = b.dataset.s; localStorage.setItem('simpos:estacion:' + D.id, estacion);
    renderEstaciones(); render();
  });
}

function render() {
  const lista = activos();
  const ahora = Date.now();
  const hoy = D.pedidos.filter(p => U.fechaISO(p.tiempos.creado) === U.fechaISO(new Date()));
  const listosHoy = hoy.filter(p => p.tiempos.listo && p.tiempos.preparacion);
  const prom = listosHoy.length ? listosHoy.reduce((a, p) => a + (new Date(p.tiempos.listo) - new Date(p.tiempos.creado)), 0) / listosHoy.length : 0;
  $('stats').innerHTML = `
    <span class="chip info">Pendientes: ${lista.filter(p => p.estado === 'pendiente').length}</span>
    <span class="chip warn">${U.esc(D.textos.preparando)}: ${lista.filter(p => p.estado === 'preparacion').length}</span>
    <span class="chip ok">Despachados hoy: ${hoy.filter(p => p.estado === 'listo' || p.estado === 'entregado').length}</span>
    <span class="chip">⏱ Promedio: ${prom ? U.mmss(prom) : '--:--'}</span>`;

  if (!lista.length) {
    $('kds').innerHTML = `<div class="kds-empty" style="grid-column:1/-1"><div class="big">${D.textos.icono}</div>
      Sin pedidos pendientes${estacion !== 'todas' ? ' en esta estación' : ''}.<div class="small">Los nuevos pedidos aparecerán aquí automáticamente.</div></div>`;
    return;
  }
  $('kds').innerHTML = lista.map(p => {
    const min = (ahora - new Date(p.tiempos.creado)) / 60000;
    const canal = D.canales.find(c => c.id === p.canal);
    const cls = [p.estado, min >= TARDE_MIN ? 'tarde' : '', nuevosFlash.has(p.id) ? 'nuevo' : ''].join(' ');
    const items = p.items.filter(i => i.estacion);
    return `<article class="ticket-k ${cls}" data-id="${p.id}">
      <div class="kh"><span class="n">#${U.pad(p.numero, 3)}</span>
        <span>${canal ? canal.icono + ' ' + U.esc(canal.nombre) : ''}${p.mesa ? ' · Mesa ' + U.esc(p.mesa) : ''}</span>
        <span class="t" data-t="${p.tiempos.creado}">${U.mmss(ahora - new Date(p.tiempos.creado))}</span></div>
      <div class="ksub"><span>${U.hora(p.tiempos.creado, false)}</span>
        ${p.cliente && p.cliente.nombre ? `<span>👤 ${U.esc(p.cliente.nombre)}</span>` : ''}
        <span class="chip ${p.comprobanteId ? 'ok' : 'warn'}">${p.comprobanteId ? 'Pagado' : 'Por cobrar'}</span>
        ${min >= AVISO_MIN && min < TARDE_MIN ? '<span class="chip warn">demorado</span>' : ''}${min >= TARDE_MIN ? '<span class="chip bad">¡urgente!</span>' : ''}</div>
      ${p.nota ? `<div class="ksub" style="color:#f59e0b;font-weight:700">📝 ${U.esc(p.nota)}</div>` : ''}
      <ul>${items.map(i => `
        <li class="${i.listo ? 'listo' : ''} ${deEstacion(i) ? '' : 'otra'}" data-l="${i.lid}" title="${deEstacion(i) ? 'Marcar ítem listo' : 'Otra estación'}">
          <span class="q">${i.cantidad}×</span>
          <div><div class="nm">${U.esc(i.nombre)}</div>
            ${Object.keys(i.opciones || {}).length ? `<div class="op">${Object.entries(i.opciones).map(([k, v]) => `${U.esc(k)}: <b>${U.esc(v)}</b>`).join(' · ')}</div>` : ''}
            ${i.nota ? `<div class="nt">» ${U.esc(i.nota)}</div>` : ''}
            ${!deEstacion(i) ? `<div class="op">${U.esc((D.estaciones.find(s => s.id === i.estacion) || {}).nombre || '')}</div>` : ''}</div>
        </li>`).join('')}</ul>
      <div class="kf">
        ${p.estado === 'pendiente' ? `<button class="btn warn grow" data-act="iniciar">▶ Iniciar</button>` : ''}
        <button class="btn ok grow" data-act="listo">✓ ${estacion === 'todas' ? 'Pedido listo' : 'Listo estación'}</button>
        <button class="icon-btn" data-act="imprimir" title="Reimprimir comanda">🖨️</button>
      </div>
    </article>`;
  }).join('');

  U.qsa('.ticket-k').forEach(card => {
    const id = card.dataset.id;
    U.qsa('li[data-l]', card).forEach(li => li.onclick = () => {
      if (li.classList.contains('otra')) return;
      Store.update(d => {
        const p = d.pedidos.find(x => x.id === id);
        const it = p.items.find(i => i.lid === li.dataset.l);
        it.listo = !it.listo;
        p.tiempos.preparacion = p.tiempos.preparacion || new Date().toISOString();
        Store.recalcularEstado(p);
      });
    });
    U.qsa('[data-act]', card).forEach(b => b.onclick = () => accion(id, b.dataset.act));
  });
}

function accion(id, act) {
  if (act === 'imprimir') {
    const p = D.pedidos.find(x => x.id === id);
    return Ticket.imprimir(Ticket.comanda(p, D, estacion === 'todas' ? null : estacion), { titulo: 'Reimprimiendo comanda…', d: D });
  }
  const r = Store.update(d => {
    const p = d.pedidos.find(x => x.id === id);
    if (act === 'iniciar') { p.tiempos.preparacion = new Date().toISOString(); }
    if (act === 'listo') {
      p.tiempos.preparacion = p.tiempos.preparacion || new Date().toISOString();
      p.items.forEach(i => { if (deEstacion(i)) i.listo = true; });
    }
    Store.recalcularEstado(p);
    return { numero: p.numero, estado: p.estado };
  });
  if (r.estado === 'listo') U.toast(`Pedido #${U.pad(r.numero, 3)} listo → mostrador`, 'ok');
}

/* Recuperar pedidos marcados como listos por error */
function modalRecientes() {
  const lista = D.pedidos.filter(p => p.estado === 'listo').slice(0, 12);
  U.modal({
    title: '↩ Recuperar pedido listo',
    body: lista.length ? `<div class="abiertos-list">${lista.map(p => `
      <div class="abierto" data-id="${p.id}"><span class="n">#${U.pad(p.numero, 3)}</span>
      <div class="grow small muted">Listo a las ${U.hora(p.tiempos.listo, false)} · ${p.items.length} ítems</div>
      <button class="btn sm">Devolver a ${U.esc(D.textos.produccion.toLowerCase())}</button></div>`).join('')}</div>` : '<p class="muted">No hay pedidos listos recientes.</p>',
    onMount(root, close) {
      U.qsa('.abierto', root).forEach(el => el.onclick = () => {
        Store.update(d => {
          const p = d.pedidos.find(x => x.id === el.dataset.id);
          p.items.forEach(i => { if (deEstacion(i)) i.listo = false; });
          delete p.tiempos.listo;
          Store.recalcularEstado(p);
        });
        close(); U.toast('Pedido devuelto a producción');
      });
    },
  });
}

/* Detectar pedidos nuevos o con ítems agregados */
function detectarNuevos() {
  let hay = false;
  D.pedidos.forEach(p => {
    const k = p.id + ':' + p.items.length;
    if (!vistos.has(k)) {
      vistos.add(k);
      if (p.estado === 'pendiente' || p.estado === 'preparacion') { hay = true; nuevosFlash.add(p.id); setTimeout(() => nuevosFlash.delete(p.id), 3500); }
    }
  });
  if (hay && sonido) U.beep('nuevo');
}

Store.subscribe(d => { D = d; detectarNuevos(); render(); });
UI.topbar('cocina');
$('btn-full').onclick = UI.pantallaCompleta;
$('btn-recientes').onclick = modalRecientes;
$('btn-sonido').onclick = () => {
  sonido = !sonido;
  $('btn-sonido').textContent = sonido ? '🔔 Sonido activo' : '🔇 Activar sonido';
  if (sonido) U.beep('nuevo');
};
/* Cronómetros en vivo */
setInterval(() => {
  const ahora = Date.now();
  U.qsa('.ticket-k .t').forEach(el => { el.textContent = U.mmss(ahora - new Date(el.dataset.t)); });
}, 1000);
setInterval(render, 30000);
renderEstaciones();
render();
