/* ==========================================================
   Mostrador — pantalla para clientes (llamado de pedidos)
   y vista de personal (entrega de pedidos)
   ========================================================== */
let D = Store.get();
let modo = U.param('modo') || localStorage.getItem('simpos:mostrador:modo') || 'cliente';
let sonido = false;
let listosPrevios = new Set(D.pedidos.filter(p => p.estado === 'listo').map(p => p.id));
const recientes = new Map(); // id -> timestamp en que pasó a listo
const colaAnuncios = [];
let anunciando = false;

const $ = id => document.getElementById(id);
const hoy = p => U.fechaISO(p.tiempos.creado) === U.fechaISO(new Date());
const enPrep = () => D.pedidos.filter(p => hoy(p) && (p.estado === 'pendiente' || p.estado === 'preparacion')).sort((a, b) => a.numero - b.numero);
const listos = () => D.pedidos.filter(p => hoy(p) && p.estado === 'listo').sort((a, b) => new Date(b.tiempos.listo) - new Date(a.tiempos.listo));
const canalDe = p => D.canales.find(c => c.id === p.canal);

function barra() {
  UI.topbar('mostrador', `
    <div class="seg"><button data-m="cliente" class="${modo === 'cliente' ? 'on' : ''}">📺 Vista cliente</button>
      <button data-m="personal" class="${modo === 'personal' ? 'on' : ''}">🧑‍💼 Vista personal</button></div>
    <button class="btn sm" id="btn-sonido">${sonido ? '🔔 Voz activa' : '🔇 Activar voz'}</button>
    <button class="btn sm" id="btn-full">⛶</button>`);
  U.qsa('[data-m]').forEach(b => b.onclick = () => { modo = b.dataset.m; localStorage.setItem('simpos:mostrador:modo', modo); barra(); render(); });
  $('btn-full').onclick = UI.pantallaCompleta;
  $('btn-sonido').onclick = () => { sonido = !sonido; barra(); if (sonido) { U.beep('listo'); U.hablar('Llamado de pedidos activado'); } };
}

function render() {
  document.body.classList.toggle('dark', modo === 'cliente');
  $('marquee').classList.toggle('hidden', modo !== 'cliente');
  $('marquee').firstElementChild.textContent = (D.empresa.promo || '').repeat(2);
  if (modo === 'cliente') return renderCliente();
  renderPersonal();
}

function renderCliente() {
  const prep = enPrep(), lis = listos();
  $('vista').innerHTML = `
    <section class="lado prep">
      <h2>⏳ ${U.esc(D.textos.preparando.toUpperCase())}</h2>
      <div class="nums">${prep.map(p => `<div class="num-card">${U.pad(p.numero, 3)}<small>${canalDe(p) ? canalDe(p).icono + ' ' + U.esc(canalDe(p).nombre) : ''}</small></div>`).join('') || '<p class="muted">—</p>'}</div>
    </section>
    <section class="lado listos">
      <h2>✅ ${U.esc(D.textos.listo.toUpperCase())}</h2>
      <div class="nums">${lis.map(p => `<div class="num-card ${Date.now() - (recientes.get(p.id) || 0) < 20000 ? 'recien' : ''}">${U.pad(p.numero, 3)}<small>${p.mesa ? 'Mesa ' + U.esc(p.mesa) : (p.cliente && p.cliente.nombre ? U.esc(p.cliente.nombre.split(' ')[0]) : 'Acérquese')}</small></div>`).join('') || '<p class="muted">Aún no hay pedidos listos.</p>'}</div>
    </section>`;
}

function renderPersonal() {
  const lis = listos(), prep = enPrep();
  const fila = (p, entregar) => {
    const c = canalDe(p);
    return `<div class="staff-item"><span class="n">#${U.pad(p.numero, 3)}</span>
      <div class="grow">
        <div class="row wrap"><b>${c ? c.icono + ' ' + U.esc(c.nombre) : ''}${p.mesa ? ' · Mesa ' + U.esc(p.mesa) : ''}</b>
          <span class="chip ${p.comprobanteId ? 'ok' : 'warn'}">${p.comprobanteId ? 'Pagado · ' + U.esc(p.comprobante || '') : 'Por cobrar'}</span>
          ${p.cliente && p.cliente.nombre ? `<span class="chip">👤 ${U.esc(p.cliente.nombre)}</span>` : ''}</div>
        ${p.cliente && p.cliente.direccion ? `<div class="small muted">📍 ${U.esc(p.cliente.direccion)} ${p.cliente.telefono ? '· ☎ ' + U.esc(p.cliente.telefono) : ''}</div>` : ''}
        <div class="small" style="margin-top:4px">${p.items.map(i => `${i.cantidad}× ${U.esc(i.nombre)}${Object.keys(i.opciones || {}).length ? ' (' + Object.values(i.opciones).map(U.esc).join(', ') + ')' : ''}`).join(' · ')}</div>
        <div class="small muted">Ingresó ${U.hora(p.tiempos.creado, false)}${p.tiempos.listo ? ' · listo ' + U.hora(p.tiempos.listo, false) : ''}</div>
      </div>
      <div class="col">
        ${entregar ? `<button class="btn ok" data-ent="${p.id}">Entregar ✓</button>
          <button class="btn sm" data-llamar="${p.id}">📣 Llamar</button>` : `<span class="chip ${p.estado === 'pendiente' ? 'info' : 'warn'}">${p.estado === 'pendiente' ? 'pendiente' : 'preparando'}</span>`}
        ${!p.comprobanteId ? `<a class="btn sm" href="pos.html?pedido=${p.id}">Cobrar</a>` : ''}
      </div></div>`;
  };
  const entregados = D.pedidos.filter(p => hoy(p) && p.estado === 'entregado').slice(0, 8);
  $('vista').innerHTML = `
    <section class="lado listos">
      <h2>✅ Listos para entregar <span class="chip ok">${lis.length}</span></h2>
      <div class="staff-list">${lis.map(p => fila(p, true)).join('') || '<p class="muted">No hay pedidos listos.</p>'}</div>
    </section>
    <section class="lado prep">
      <h2>⏳ ${U.esc(D.textos.preparando)} <span class="chip warn">${prep.length}</span></h2>
      <div class="staff-list">${prep.map(p => fila(p, false)).join('') || '<p class="muted">—</p>'}</div>
      <h2 style="margin-top:20px;font-size:18px">📦 Entregados recientemente</h2>
      <div class="small muted">${entregados.map(p => `#${U.pad(p.numero, 3)} (${U.hora(p.tiempos.entregado, false)})`).join(' · ') || '—'}</div>
    </section>`;
  U.qsa('[data-ent]').forEach(b => b.onclick = () => {
    Store.update(d => { const p = d.pedidos.find(x => x.id === b.dataset.ent); p.estado = 'entregado'; p.tiempos.entregado = new Date().toISOString(); });
    U.toast('Pedido entregado', 'ok');
  });
  U.qsa('[data-llamar]').forEach(b => b.onclick = () => {
    const p = D.pedidos.find(x => x.id === b.dataset.llamar);
    anunciar(p, true);
  });
}

/* ---------- Anuncio de pedido listo ---------- */
function anunciar(p, forzar = false) {
  colaAnuncios.push({ p, forzar });
  if (!anunciando) siguienteAnuncio();
}
async function siguienteAnuncio() {
  const a = colaAnuncios.shift();
  if (!a) { anunciando = false; return; }
  anunciando = true;
  const { p } = a;
  if (sonido) U.beep('listo');
  if (modo === 'cliente') {
    const el = document.createElement('div');
    el.className = 'anuncio';
    el.innerHTML = `<div><div class="t">PEDIDO</div><div class="n">${U.pad(p.numero, 3)}</div>
      <div class="t">${U.esc(D.textos.listo.toUpperCase())}${p.mesa ? ' · MESA ' + U.esc(p.mesa) : ''}</div></div>`;
    document.body.appendChild(el);
    if (sonido && D.config.voz) U.hablar(`Pedido número ${p.numero}, ${D.textos.listo.toLowerCase()}`);
    await U.sleep(4200);
    el.remove();
  } else {
    if (sonido && D.config.voz) U.hablar(`Pedido número ${p.numero}`);
    await U.sleep(1500);
  }
  siguienteAnuncio();
}

function detectarListos() {
  const ahora = new Set(listos().map(p => p.id));
  ahora.forEach(id => {
    if (!listosPrevios.has(id)) {
      recientes.set(id, Date.now());
      anunciar(D.pedidos.find(p => p.id === id));
    }
  });
  listosPrevios = ahora;
}

Store.subscribe(d => { D = d; detectarListos(); render(); });
barra();
render();
setInterval(render, 10000);
