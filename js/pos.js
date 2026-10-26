/* ==========================================================
   POS — toma de pedidos, cobro y emisión de comprobantes
   ========================================================== */
let D = Store.get();
let categoria = 'todas';
let busqueda = '';
let orden = nuevaOrden();

function nuevaOrden() {
  return { pedidoId: null, numero: null, items: [], canal: D.canales[0].id, mesa: '', cliente: '', telefono: '', direccion: '', nota: '', descuento: 0 };
}
const $ = id => document.getElementById(id);
const canalActual = () => D.canales.find(c => c.id === orden.canal) || D.canales[0];
const pendientesCobro = () => D.pedidos.filter(p => !p.comprobanteId && p.estado !== 'anulado');
const cajero = () => (D.caja.sesion && D.caja.sesion.cajero) || 'Cajero 1';

/* ---------- Catálogo ---------- */
function renderCats() {
  const cats = [{ id: 'todas', nombre: 'Todo' }, ...D.categorias];
  $('cats').innerHTML = cats.map(c => `<button data-c="${c.id}" class="${c.id === categoria ? 'on' : ''}">${U.esc(c.nombre)}</button>`).join('');
  U.qsa('#cats button').forEach(b => b.onclick = () => { categoria = b.dataset.c; renderCats(); renderProductos(); });
}

function enCarrito(prodId) {
  return orden.items.filter(i => i.productoId === prodId && !i.enviado).reduce((a, i) => a + i.cantidad, 0);
}
function disponible(p) { return p.stock == null ? Infinity : p.stock - enCarrito(p.id); }

function renderProductos() {
  const q = busqueda.trim().toLowerCase();
  const lista = D.productos.filter(p => p.activo !== false
    && (categoria === 'todas' || p.categoria === categoria)
    && (!q || p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)));
  $('productos').innerHTML = lista.map(p => {
    const disp = disponible(p);
    const stock = p.stock == null ? '' : `<span class="chip stock ${disp <= 0 ? 'bad' : disp <= 5 ? 'warn' : ''}">${disp <= 0 ? 'Agotado' : 'Stock ' + disp}</span>`;
    return `<button class="prod ${disp <= 0 ? 'agotado' : ''}" data-id="${p.id}">
      ${stock}<span class="emoji">${p.emoji || '📦'}</span>
      <span class="name">${U.esc(p.nombre)}</span>
      <span class="small muted">${U.esc(p.codigo)}${p.opciones && p.opciones.length ? ' · ' + p.opciones.map(o => o.nombre).join('/') : ''}</span>
      <span class="price">${U.money(p.precio)}</span></button>`;
  }).join('') || '<div class="muted">No hay productos que coincidan.</div>';
  U.qsa('#productos .prod').forEach(b => b.onclick = () => elegir(D.productos.find(p => p.id === b.dataset.id)));
}

function elegir(p) {
  if ((p.opciones && p.opciones.length) || p.stock != null) return modalOpciones(p);
  agregar(p, 1, {}, '');
}

function agregar(p, cantidad, opciones, nota) {
  if (disponible(p) < cantidad) { U.toast('Stock insuficiente', 'bad'); return; }
  const firma = JSON.stringify(opciones) + '|' + nota;
  const ex = orden.items.find(i => !i.enviado && i.productoId === p.id && (JSON.stringify(i.opciones) + '|' + i.nota) === firma);
  if (ex) ex.cantidad += cantidad;
  else orden.items.push({
    lid: U.uid(), productoId: p.id, codigo: p.codigo, nombre: p.nombre, emoji: p.emoji, precio: p.precio,
    cantidad, opciones, nota, unidad: p.unidad || 'NIU', icbper: !!p.icbper, estacion: Store.estacionDe(D, p), listo: false, enviado: false,
  });
  renderOrden(); renderProductos();
}

function modalOpciones(p, editar = null) {
  const sel = {};
  (p.opciones || []).forEach(o => { sel[o.nombre] = editar ? editar.opciones[o.nombre] : o.valores[0]; });
  let cant = editar ? editar.cantidad : 1;
  const body = `
    <div class="row" style="margin-bottom:14px"><span style="font-size:40px">${p.emoji || '📦'}</span>
      <div><div class="b" style="font-weight:700;font-size:16px">${U.esc(p.nombre)}</div>
      <div class="muted">${U.money(p.precio)} · ${U.esc(p.codigo)}${p.stock != null ? ' · Stock disponible: ' + (disponible(p) + (editar ? editar.cantidad : 0)) : ''}</div></div></div>
    ${(p.opciones || []).map(o => `
      <div class="opt-group"><h4>${U.esc(o.nombre)}</h4><div class="opt-vals" data-op="${U.esc(o.nombre)}">
        ${o.valores.map(v => `<button data-v="${U.esc(v)}" class="${sel[o.nombre] === v ? 'on' : ''}">${U.esc(v)}</button>`).join('')}
      </div></div>`).join('')}
    <div class="opt-group"><h4>Cantidad</h4><div class="row"><button class="icon-btn" data-q="-1">−</button>
      <b id="m-cant" style="min-width:30px;text-align:center;font-size:18px">${cant}</b><button class="icon-btn" data-q="1">+</button></div></div>
    <label class="field">Nota / indicación ${D.rubro === 'restaurante' ? '(ej. sin cebolla, término, alergias)' : '(ej. envolver para regalo)'}
      <input id="m-nota" maxlength="80" value="${editar ? U.esc(editar.nota) : ''}"></label>`;
  U.modal({
    title: editar ? 'Editar ítem' : 'Agregar al pedido', body,
    onMount(root) {
      U.qsa('.opt-vals', root).forEach(g => g.onclick = e => {
        const b = e.target.closest('button'); if (!b) return;
        sel[g.dataset.op] = b.dataset.v;
        U.qsa('button', g).forEach(x => x.classList.toggle('on', x === b));
      });
      U.qsa('[data-q]', root).forEach(b => b.onclick = () => {
        cant = Math.max(1, cant + Number(b.dataset.q));
        U.qs('#m-cant', root).textContent = cant;
      });
      setTimeout(() => U.qs('#m-nota', root).focus(), 50);
      U.qs('#m-nota', root).onkeydown = e => { if (e.key === 'Enter') U.qs('.modal-foot .primary', root).click(); };
    },
    actions: [
      { label: 'Cancelar' },
      {
        label: editar ? 'Guardar' : 'Agregar', cls: 'primary', onClick: (close, root) => {
          const nota = U.qs('#m-nota', root).value.trim();
          if (editar) {
            const libre = disponible(p) + editar.cantidad;
            if (libre < cant) { U.toast('Stock insuficiente', 'bad'); return false; }
            Object.assign(editar, { opciones: { ...sel }, nota, cantidad: cant });
            renderOrden(); renderProductos();
          } else agregar(p, cant, { ...sel }, nota);
        },
      },
    ],
  });
}

/* ---------- Pedido en curso ---------- */
function renderCanales() {
  $('canales').innerHTML = D.canales.map(c => `<button data-c="${c.id}" class="${c.id === orden.canal ? 'on' : ''}" ${orden.pedidoId ? 'disabled' : ''}>${c.icono} ${U.esc(c.nombre)}</button>`).join('');
  U.qsa('#canales button').forEach(b => b.onclick = () => { orden.canal = b.dataset.c; renderCanales(); });
  const c = canalActual();
  let h = '';
  if (c.pideMesa) {
    h += `<select id="o-mesa" ${orden.pedidoId ? 'disabled' : ''}><option value="">Mesa…</option>${D.mesas.map(m => `<option ${m === orden.mesa ? 'selected' : ''}>${U.esc(m)}</option>`).join('')}</select>`;
  }
  h += `<input id="o-cliente" class="grow" placeholder="${c.id === 'delivery' || c.id === 'recojo' ? 'Nombre del cliente *' : 'Nombre (opcional)'}" value="${U.esc(orden.cliente)}">`;
  if (c.id === 'delivery') {
    h += `<input id="o-tel" placeholder="Teléfono" style="width:120px" value="${U.esc(orden.telefono)}">
          <input id="o-dir" style="flex-basis:100%" placeholder="Dirección de entrega *" value="${U.esc(orden.direccion)}">`;
  }
  h += `<input id="o-nota" style="flex-basis:100%" placeholder="Nota general del pedido (opcional)" value="${U.esc(orden.nota)}">`;
  $('extra-canal').innerHTML = h;
  const bind = (id, k) => { const el = $(id); if (el) el.oninput = el.onchange = () => { orden[k] = el.value; }; };
  bind('o-mesa', 'mesa'); bind('o-cliente', 'cliente'); bind('o-tel', 'telefono'); bind('o-dir', 'direccion'); bind('o-nota', 'nota');
}

function renderOrden() {
  $('orden-titulo').textContent = orden.pedidoId ? `Pedido #${U.pad(orden.numero, 3)} (por cobrar)` : 'Nuevo pedido';
  $('btn-enviar').innerHTML = orden.pedidoId ? `${D.textos.icono} Agregar y enviar` : `${D.textos.icono} ${D.textos.enviar}`;
  if (!orden.items.length) {
    $('items').innerHTML = `<div class="orden-empty"><div class="big">${D.empresa.logo}</div>
      <div>Toca un producto para agregarlo.</div><div class="small">Puedes cobrar ahora o ${D.textos.enviar.toLowerCase()} y cobrar después.</div></div>`;
  } else {
    $('items').innerHTML = orden.items.map(i => `
      <div class="item ${i.enviado ? 'locked' : ''}" data-l="${i.lid}">
        <div><div class="nm">${i.emoji || ''} ${U.esc(i.nombre)}</div>
          ${Object.keys(i.opciones || {}).length ? `<div class="det">${Object.entries(i.opciones).map(([k, v]) => `${U.esc(k)}: ${U.esc(v)}`).join(' · ')}</div>` : ''}
          ${i.nota ? `<div class="nota">✎ ${U.esc(i.nota)}</div>` : ''}
          <div class="det">${U.money(i.precio)} c/u ${i.enviado ? `· <span class="chip ${i.listo ? 'ok' : 'info'}">${i.listo ? 'listo' : 'enviado'}</span>` : ''}${i.icbper ? ' · + ICBPER' : ''}</div></div>
        <div class="col" style="align-items:flex-end">
          <div class="imp">${U.money(i.precio * i.cantidad)}</div>
          ${i.enviado ? `<span class="small muted">x${i.cantidad}</span>` : `
          <div class="qty"><button class="icon-btn" data-a="-">−</button><span>${i.cantidad}</span><button class="icon-btn" data-a="+">+</button>
            <button class="icon-btn" data-a="e" title="Editar">✎</button></div>`}
        </div>
      </div>`).join('');
    U.qsa('#items .item').forEach(el => el.onclick = e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const it = orden.items.find(i => i.lid === el.dataset.l);
      const p = D.productos.find(x => x.id === it.productoId);
      if (b.dataset.a === '+') { if (p && disponible(p) <= 0) return U.toast('Stock insuficiente', 'bad'); it.cantidad++; }
      if (b.dataset.a === '-') { it.cantidad--; if (it.cantidad <= 0) orden.items = orden.items.filter(x => x !== it); }
      if (b.dataset.a === 'e') { if (p) modalOpciones(p, it); return; }
      renderOrden(); renderProductos();
    });
  }
  const t = U.calcularTotales(orden.items, orden.descuento, D.config);
  $('totales').innerHTML = `
    <div class="tot-row"><span>Subtotal</span><span class="num">${U.money(t.bruto)}</span></div>
    <div class="tot-row"><span>Descuento <button class="btn sm ghost" id="btn-desc">${t.descuento ? 'editar' : '+ agregar'}</button></span><span class="num">-${U.money(t.descuento)}</span></div>
    <div class="tot-row small"><span>Op. gravada · IGV ${D.config.igv}%</span><span class="num">${U.money(t.gravada)} · ${U.money(t.igv)}</span></div>
    ${t.icbper ? `<div class="tot-row small"><span>ICBPER (bolsas)</span><span class="num">${U.money(t.icbper)}</span></div>` : ''}
    <div class="tot-row big"><span>Total</span><span class="num">${U.money(t.total)}</span></div>`;
  $('btn-desc').onclick = modalDescuento;
  const nuevos = orden.items.filter(i => !i.enviado).length;
  $('btn-enviar').disabled = !nuevos;
  $('btn-cobrar').disabled = !orden.items.length;
  $('btn-cobrar').innerHTML = `💳 Cobrar ${orden.items.length ? U.money(t.total) : ''}`;
}

function modalDescuento() {
  const t = U.calcularTotales(orden.items, 0, D.config);
  U.modal({
    title: 'Aplicar descuento',
    body: `<div class="col">
      <div class="seg" id="d-tipo"><button data-t="pct" class="on">Porcentaje %</button><button data-t="monto">Monto S/</button></div>
      <input id="d-val" type="number" min="0" step="0.01" placeholder="0" value="">
      <div class="row wrap">${[5, 10, 15, 20, 50].map(x => `<button class="btn sm" data-p="${x}">${x}%</button>`).join('')}</div>
      <div class="muted small">Subtotal: ${U.money(t.bruto)}. El descuento se aplica sobre el total con IGV.</div></div>`,
    onMount(root) {
      let tipo = 'pct';
      root.dataset.tipo = tipo;
      U.qsa('#d-tipo button', root).forEach(b => b.onclick = () => {
        tipo = b.dataset.t; root.dataset.tipo = tipo;
        U.qsa('#d-tipo button', root).forEach(x => x.classList.toggle('on', x === b));
      });
      U.qsa('[data-p]', root).forEach(b => b.onclick = () => { U.qsa('#d-tipo button', root)[0].click(); U.qs('#d-val', root).value = b.dataset.p; });
      U.qs('#d-val', root).focus();
    },
    actions: [
      { label: 'Quitar descuento', onClick: () => { orden.descuento = 0; renderOrden(); } },
      {
        label: 'Aplicar', cls: 'primary', onClick: (c, root) => {
          const v = Number(U.qs('#d-val', root).value) || 0;
          orden.descuento = root.dataset.tipo === 'pct' ? U.r2(t.bruto * Math.min(v, 100) / 100) : Math.min(v, t.bruto);
          renderOrden();
        },
      },
    ],
  });
}

/* ---------- Validaciones del pedido ---------- */
function validarPedido() {
  const c = canalActual();
  if (!orden.items.length) return 'El pedido está vacío';
  if (c.pideMesa && !orden.mesa) return 'Selecciona la mesa';
  if ((c.id === 'delivery' || c.id === 'recojo') && !orden.cliente.trim()) return 'Ingresa el nombre del cliente';
  if (c.id === 'delivery' && !orden.direccion.trim()) return 'Ingresa la dirección de entrega';
  return null;
}

/** Crea o actualiza el pedido dentro de una transacción del Store. Devuelve {p, nuevos} */
function persistirPedido(d) {
  let p;
  const nuevos = orden.items.filter(i => !i.enviado).map(i => ({ ...i, enviado: true, listo: !i.estacion }));
  if (orden.pedidoId) {
    p = d.pedidos.find(x => x.id === orden.pedidoId);
    p.items.push(...nuevos);
    p.descuento = orden.descuento;
  } else {
    p = {
      id: U.uid(), numero: Store.siguientePedido(d), canal: orden.canal, mesa: canalActual().pideMesa ? orden.mesa : '',
      cliente: { nombre: orden.cliente.trim(), telefono: orden.telefono.trim(), direccion: orden.direccion.trim() },
      nota: orden.nota.trim(), items: nuevos, descuento: orden.descuento, estado: 'pendiente',
      tiempos: { creado: new Date().toISOString() }, comprobanteId: null, cajero: cajero(),
    };
    d.pedidos.unshift(p);
  }
  nuevos.forEach(i => {
    const prod = d.productos.find(x => x.id === i.productoId);
    if (prod && prod.stock != null) prod.stock = Math.max(0, prod.stock - i.cantidad);
  });
  Store.recalcularEstado(p);
  return { p, nuevos };
}

function enviarProduccion() {
  const err = validarPedido();
  if (err) return U.toast(err, 'bad');
  const { p, nuevos } = Store.update(d => persistirPedido(d));
  const conPrep = nuevos.filter(i => i.estacion);
  U.toast(`Pedido #${U.pad(p.numero, 3)} enviado a ${D.textos.produccion.toLowerCase()}`, 'ok');
  if (D.config.autoComanda && conPrep.length) Ticket.imprimir(Ticket.comanda({ ...p, items: conPrep }, D), { titulo: `Imprimiendo ${D.textos.comanda.toLowerCase()}…` });
  orden = nuevaOrden(); renderTodo();
}

/* ---------- Cobro ---------- */
async function asegurarCaja() {
  if (D.caja.abierta) return true;
  return new Promise(res => {
    let ok = false;
    U.modal({
      title: '💰 Apertura de caja',
      body: `<p class="muted">Para cobrar primero abre la caja del turno.</p>
        <div class="form-grid"><label class="field">Cajero<input id="a-caj" value="Cajero 1"></label>
        <label class="field">Fondo inicial (S/)<input id="a-fondo" type="number" min="0" step="0.1" value="200"></label></div>`,
      actions: [{ label: 'Cancelar' }, {
        label: 'Abrir caja', cls: 'primary', onClick: (c, root) => {
          const caj = U.qs('#a-caj', root).value.trim() || 'Cajero 1';
          const fondo = Number(U.qs('#a-fondo', root).value) || 0;
          Store.update(d => { d.caja.abierta = true; d.caja.sesion = { id: U.uid(), cajero: caj, fondo, desde: new Date().toISOString() }; });
          ok = true; U.toast('Caja abierta', 'ok');
        },
      }],
      onClose: () => res(ok),
    });
  });
}

/* Consulta simulada de RENIEC / SUNAT (para la demo) */
function consultaSimulada(tipoDoc, num) {
  const nombres = ['MARÍA FERNANDA QUISPE ROJAS', 'JOSÉ LUIS HUAMÁN TORRES', 'ANA LUCÍA MENDOZA SALAZAR', 'CARLOS ALBERTO RAMÍREZ FLORES', 'ROSA ELENA CHÁVEZ VARGAS', 'JORGE MANUEL CASTILLO PAREDES'];
  const empresas = [['INVERSIONES ANDINAS DEL SUR S.A.C.', 'Av. Javier Prado Este 1234, San Isidro - Lima'], ['DISTRIBUIDORA PACÍFICO NORTE E.I.R.L.', 'Calle Los Pinos 145, Miraflores - Lima'], ['SERVICIOS GENERALES LIMA CENTRO S.R.L.', 'Av. Arequipa 2450, Lince - Lima']];
  const k = [...String(num)].reduce((a, ch) => a + Number(ch), 0);
  if (tipoDoc === '6') return { nombre: empresas[k % empresas.length][0], direccion: empresas[k % empresas.length][1] };
  return { nombre: nombres[k % nombres.length], direccion: '' };
}

async function cobrar() {
  const err = validarPedido();
  if (err) return U.toast(err, 'bad');
  if (!(await asegurarCaja())) return;
  const t = U.calcularTotales(orden.items, orden.descuento, D.config);
  const st = { tipo: '03', tipoDoc: '0', metodo: 'efectivo' };

  const billetes = [...new Set([Math.ceil(t.total), Math.ceil(t.total / 10) * 10, Math.ceil(t.total / 20) * 20, Math.ceil(t.total / 50) * 50, Math.ceil(t.total / 100) * 100, 200])].filter(v => v >= t.total).sort((a, b) => a - b).slice(0, 5);

  const body = `
    <div class="col" id="cobro-form" style="gap:14px">
      <div class="tipo-doc" id="c-tipo">
        <button data-t="03" class="on"><b>🧾 Boleta</b><span>Consumidor final</span></button>
        <button data-t="01"><b>🏢 Factura</b><span>Requiere RUC</span></button>
        <button data-t="NV"><b>📄 Nota de venta</b><span>Interno</span></button>
      </div>
      <div class="form-grid" id="c-cliente"></div>
      <div><div class="small b muted" style="margin-bottom:6px">MEDIO DE PAGO</div>
        <div class="metodos" id="c-met">${Object.entries(Facturador.METODOS).map(([k, m]) => `<button data-m="${k}" class="${k === 'efectivo' ? 'on' : ''}"><span class="ic">${m.icono}</span><b>${m.nombre}</b></button>`).join('')}</div></div>
      <div id="c-pago"></div>
      <div class="resumen-cobro">
        <div class="tot-row"><span>Op. gravada</span><span>${U.money(t.gravada)}</span></div>
        <div class="tot-row"><span>IGV ${D.config.igv}%</span><span>${U.money(t.igv)}</span></div>
        ${t.descuento ? `<div class="tot-row"><span>Descuento</span><span>-${U.money(t.descuento)}</span></div>` : ''}
        ${t.icbper ? `<div class="tot-row"><span>ICBPER</span><span>${U.money(t.icbper)}</span></div>` : ''}
        <div class="tot-row big"><span>Total a cobrar</span><span>${U.money(t.total)}</span></div>
      </div>
      <div class="field-error" id="c-err"></div>
    </div>
    <div id="cobro-proc" class="hidden">
      <p class="muted">Procesando comprobante en <b>modo simulación</b>…</p>
      <ul class="pasos" id="pasos"></ul>
    </div>`;

  const m = U.modal({
    title: `Cobrar ${U.money(t.total)}`, body, sticky: true,
    actions: [{ label: 'Cancelar' }, { label: '✅ Emitir e imprimir', cls: 'primary lg', id: 'btn-emitir', onClick: (close, root) => { procesar(root, close); return false; } }],
    onMount(root) {
      const renderCliente = () => {
        const box = U.qs('#c-cliente', root);
        if (st.tipo === '01') st.tipoDoc = '6';
        else if (st.tipoDoc === '6' && st.tipo !== '03') st.tipoDoc = '0';
        const opts = st.tipo === '01' ? [['6', 'RUC']] : [['0', 'Sin documento'], ['1', 'DNI'], ['4', 'Carné extranjería'], ['7', 'Pasaporte'], ['6', 'RUC']];
        const nombre = orden.cliente || '';
        box.innerHTML = `
          <label class="field">Tipo de documento<select id="c-tdoc">${opts.map(([v, l]) => `<option value="${v}" ${v === st.tipoDoc ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field">Número<div class="row"><input id="c-ndoc" class="grow" inputmode="numeric" ${st.tipoDoc === '0' ? 'disabled placeholder="-"' : ''} maxlength="12">
            <button class="btn sm" id="c-buscar" ${st.tipoDoc === '0' ? 'disabled' : ''} title="Consulta simulada RENIEC/SUNAT">🔎</button></div></label>
          <label class="field" style="grid-column:1/-1">${st.tipoDoc === '6' ? 'Razón social' : 'Nombre del cliente'}<input id="c-nom" value="${U.esc(st.tipoDoc === '0' ? (nombre || '') : nombre)}" placeholder="${st.tipoDoc === '0' ? 'CLIENTES VARIOS' : ''}"></label>
          ${st.tipo === '01' ? `<label class="field" style="grid-column:1/-1">Dirección fiscal<input id="c-dir"></label>` : ''}`;
        U.qs('#c-tdoc', root).onchange = e => { st.tipoDoc = e.target.value; renderCliente(); };
        const buscar = U.qs('#c-buscar', root);
        buscar.onclick = () => {
          const num = U.qs('#c-ndoc', root).value.trim();
          if (st.tipoDoc === '1' && !U.validarDNI(num)) return U.toast('DNI inválido (8 dígitos)', 'bad');
          if (st.tipoDoc === '6' && !U.validarRUC(num)) return U.toast('RUC inválido (dígito verificador)', 'bad');
          const r = consultaSimulada(st.tipoDoc, num);
          U.qs('#c-nom', root).value = r.nombre;
          const dir = U.qs('#c-dir', root); if (dir) dir.value = r.direccion;
          U.toast('Datos autocompletados (consulta simulada)', 'ok');
        };
      };
      const renderPago = () => {
        const box = U.qs('#c-pago', root);
        if (st.metodo === 'efectivo') {
          box.innerHTML = `<div class="row wrap" style="align-items:flex-end">
            <label class="field" style="width:160px">Monto recibido (S/)<input id="c-rec" type="number" step="0.1" min="0" value="${U.f2(t.total)}"></label>
            <div class="billetes">${billetes.map(b => `<button class="btn sm" data-b="${b}">S/ ${b}</button>`).join('')}</div>
            <span class="spacer"></span><div class="right"><div class="small muted">Vuelto</div><div class="vuelto" id="c-vuelto">S/ 0.00</div></div></div>`;
          const upd = () => { const r = Number(U.qs('#c-rec', root).value) || 0; U.qs('#c-vuelto', root).textContent = U.money(Math.max(0, r - t.total)); U.qs('#c-vuelto', root).style.color = r < t.total ? 'var(--bad)' : ''; };
          U.qs('#c-rec', root).oninput = upd;
          U.qsa('[data-b]', box).forEach(b => b.onclick = () => { U.qs('#c-rec', root).value = b.dataset.b; upd(); });
          upd();
        } else {
          box.innerHTML = `<label class="field">N° de operación / voucher ${st.metodo === 'tarjeta' ? '(POS bancario)' : ''} — opcional
            <input id="c-ref" placeholder="${st.metodo === 'yape' || st.metodo === 'plin' ? 'Ej. 04512398' : 'Ej. 001245'}"></label>`;
        }
      };
      U.qsa('#c-tipo button', root).forEach(b => b.onclick = () => {
        st.tipo = b.dataset.t;
        U.qsa('#c-tipo button', root).forEach(x => x.classList.toggle('on', x === b));
        renderCliente();
      });
      U.qsa('#c-met button', root).forEach(b => b.onclick = () => {
        st.metodo = b.dataset.m;
        U.qsa('#c-met button', root).forEach(x => x.classList.toggle('on', x === b));
        renderPago();
      });
      renderCliente(); renderPago();
    },
  });

  async function procesar(root) {
    const errBox = U.qs('#c-err', root);
    const numDoc = (U.qs('#c-ndoc', root).value || '').trim();
    let nombre = U.qs('#c-nom', root).value.trim();
    const dir = U.qs('#c-dir', root) ? U.qs('#c-dir', root).value.trim() : '';
    const fail = msg => { errBox.textContent = '⚠ ' + msg; U.beep('error'); };
    if (st.tipo === '01') {
      if (!U.validarRUC(numDoc)) return fail('RUC inválido. Verifica los 11 dígitos (prueba 20555666773).');
      if (!nombre) return fail('Ingresa la razón social.');
      if (!dir) return fail('Ingresa la dirección fiscal.');
    } else {
      if (st.tipoDoc === '1' && !U.validarDNI(numDoc)) return fail('El DNI debe tener 8 dígitos.');
      if (st.tipoDoc === '6' && !U.validarRUC(numDoc)) return fail('RUC inválido.');
      if ((st.tipoDoc === '4' || st.tipoDoc === '7') && !U.validarCE(numDoc)) return fail('Documento inválido.');
      if (st.tipo === '03' && st.tipoDoc === '0' && t.total >= D.config.limiteBoletaDNI) return fail(`Para boletas desde S/ ${D.config.limiteBoletaDNI} se debe identificar al cliente (DNI).`);
      if (st.tipoDoc !== '0' && !nombre) return fail('Ingresa el nombre del cliente.');
      if (st.tipoDoc === '0') nombre = nombre || 'CLIENTES VARIOS';
    }
    let pago = { metodo: st.metodo };
    if (st.metodo === 'efectivo') {
      const rec = Number(U.qs('#c-rec', root).value) || 0;
      if (rec < t.total) return fail('El monto recibido es menor al total.');
      pago.recibido = U.r2(rec); pago.vuelto = U.r2(rec - t.total);
    } else pago.referencia = U.qs('#c-ref', root).value.trim();

    // Vista de progreso
    U.qs('#cobro-form', root).classList.add('hidden');
    U.qs('#cobro-proc', root).classList.remove('hidden');
    U.qsa('.modal-foot button', root).forEach(b => b.disabled = true);
    U.qs('[data-x]', root).disabled = true;
    const pasos = U.qs('#pasos', root);
    const paso = txt => {
      U.qsa('li.run', pasos).forEach(li => { li.className = 'done'; li.querySelector('.st').textContent = '✓'; });
      pasos.insertAdjacentHTML('beforeend', `<li class="run"><span class="st"></span>${U.esc(txt)}</li>`);
    };

    paso('Registrando pedido');
    const cliente = { tipoDoc: st.tipoDoc, numDoc: st.tipoDoc === '0' ? '-' : numDoc, nombre, direccion: dir || (canalActual().id === 'delivery' ? orden.direccion : '') };
    const res = Store.update(d => {
      const { p, nuevos } = persistirPedido(d);
      p.cliente = p.cliente || {};
      if (!p.cliente.nombre && st.tipoDoc !== '0') p.cliente.nombre = nombre;
      const c = Facturador.construir(d, { tipo: st.tipo, items: p.items, descuento: p.descuento, cliente, pago, pedido: p, cajero: cajero() });
      d.comprobantes.unshift(c);
      p.comprobanteId = c.id;
      p.comprobante = Facturador.codigo(c);
      return { pedido: JSON.parse(JSON.stringify(p)), nuevos, comp: JSON.parse(JSON.stringify(c)) };
    });
    await U.sleep(250);
    let sunat;
    try {
      sunat = await Facturador.emitir(res.comp, D.empresa, paso);
    } catch (e) {
      sunat = { estado: 'ERROR', codigo: '-1', descripcion: e.message, hash: '' };
    }
    Store.update(d => { const c = d.comprobantes.find(x => x.id === res.comp.id); c.sunat = sunat; });
    res.comp.sunat = sunat;
    paso('Enviando a impresora');
    await U.sleep(300);
    U.qsa('li.run', pasos).forEach(li => { li.className = 'done'; li.querySelector('.st').textContent = '✓'; });
    m.close();

    const tickets = [Ticket.comprobante(res.comp, D)];
    const conPrep = res.nuevos.filter(i => i.estacion);
    if (D.config.autoComanda && conPrep.length) tickets.push(Ticket.comanda({ ...res.pedido, items: conPrep }, D));
    if (conPrep.length && !canalActual().pideMesa) tickets.push(Ticket.turno(res.pedido, D));
    Ticket.imprimir(tickets, { titulo: `Imprimiendo ${Facturador.TIPOS[res.comp.tipo].toLowerCase()} ${Facturador.codigo(res.comp)}…` });
    U.toast(`${Facturador.codigo(res.comp)} · ${sunat.estado}`, sunat.estado === 'ERROR' ? 'bad' : 'ok');
    orden = nuevaOrden(); renderTodo();
  }
}

/* ---------- Pedidos por cobrar ---------- */
function modalAbiertos() {
  const lista = pendientesCobro();
  const estadoChip = p => ({ pendiente: '<span class="chip info">pendiente</span>', preparacion: '<span class="chip warn">en preparación</span>', listo: '<span class="chip ok">listo</span>', entregado: '<span class="chip">entregado</span>' }[p.estado] || '');
  U.modal({
    title: '📋 Pedidos por cobrar', wide: true,
    body: lista.length ? `<div class="abiertos-list">${lista.map(p => {
      const c = D.canales.find(x => x.id === p.canal);
      const t = U.calcularTotales(p.items, p.descuento, D.config);
      return `<div class="abierto" data-id="${p.id}"><span class="n">#${U.pad(p.numero, 3)}</span>
        <div class="grow"><div class="b" style="font-weight:700">${c ? c.icono + ' ' + U.esc(c.nombre) : ''}${p.mesa ? ' · Mesa ' + U.esc(p.mesa) : ''}${p.cliente && p.cliente.nombre ? ' · ' + U.esc(p.cliente.nombre) : ''}</div>
          <div class="small muted">${p.items.length} ítems · ${U.hora(p.tiempos.creado, false)} · ${estadoChip(p)}</div></div>
        <b class="num">${U.money(t.total)}</b>
        <button class="btn sm danger" data-anular="${p.id}" title="Anular pedido">Anular</button>
        <button class="btn sm primary">Cargar</button></div>`;
    }).join('')}</div>` : '<p class="muted">No hay pedidos pendientes de cobro.</p>',
    onMount(root, close) {
      U.qsa('.abierto', root).forEach(el => el.onclick = async e => {
        if (e.target.dataset.anular) {
          e.stopPropagation();
          if (!(await U.confirmar('Anular pedido', 'El pedido se retirará de producción y se devolverá el stock.', 'Anular', 'danger'))) return;
          Store.update(d => {
            const p = d.pedidos.find(x => x.id === e.target.dataset.anular);
            p.estado = 'anulado'; p.tiempos.anulado = new Date().toISOString();
            p.items.forEach(i => { const pr = d.productos.find(x => x.id === i.productoId); if (pr && pr.stock != null) pr.stock += i.cantidad; });
          });
          close(); U.toast('Pedido anulado', 'warn'); return;
        }
        cargarPedido(el.dataset.id); close();
      });
    },
  });
}

function cargarPedido(id) {
  const p = D.pedidos.find(x => x.id === id);
  if (!p) return;
  orden = {
    pedidoId: p.id, numero: p.numero, canal: p.canal, mesa: p.mesa || '', cliente: (p.cliente && p.cliente.nombre) || '',
    telefono: (p.cliente && p.cliente.telefono) || '', direccion: (p.cliente && p.cliente.direccion) || '', nota: p.nota || '',
    descuento: p.descuento || 0, items: p.items.map(i => ({ ...i, enviado: true })),
  };
  renderTodo();
  U.toast(`Pedido #${U.pad(p.numero, 3)} cargado`);
}

/* ---------- General ---------- */
function renderCajaChip() {
  const el = $('caja-estado');
  if (D.caja.abierta) { el.className = 'chip ok'; el.textContent = `● Caja abierta · ${D.caja.sesion.cajero}`; }
  else { el.className = 'chip warn'; el.textContent = '● Caja cerrada'; }
  const n = pendientesCobro().length;
  $('cnt-abiertos').textContent = n;
  $('cnt-abiertos').classList.toggle('hidden', !n);
}

function renderTodo() { renderCats(); renderProductos(); renderCanales(); renderOrden(); renderCajaChip(); }

Store.subscribe(d => {
  D = d;
  if (orden.pedidoId) {
    const p = D.pedidos.find(x => x.id === orden.pedidoId);
    if (!p || p.comprobanteId || p.estado === 'anulado') { orden = nuevaOrden(); U.toast('El pedido cargado fue modificado en otra pantalla', 'warn'); renderTodo(); return; }
    // refrescar estado "listo" de los ítems ya enviados
    orden.items.forEach(i => { const o = p.items.find(x => x.lid === i.lid); if (o) i.listo = o.listo; });
    renderOrden();
  }
  renderProductos(); renderCajaChip();
});

UI.topbar('pos');
$('buscar').oninput = e => { busqueda = e.target.value; renderProductos(); };
$('btn-enviar').onclick = enviarProduccion;
$('btn-cobrar').onclick = cobrar;
$('btn-abiertos').onclick = modalAbiertos;
$('btn-limpiar').onclick = () => { orden = nuevaOrden(); renderTodo(); };
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && !document.querySelector('.modal-back')) { e.preventDefault(); $('buscar').focus(); }
});
if (U.param('pedido')) cargarPedido(U.param('pedido'));
renderTodo();
