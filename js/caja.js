/* ==========================================================
   Caja: apertura/cierre, arqueo, reportes X/Z,
   comprobantes, notas de crédito y exportación
   ========================================================== */
let D = Store.get();
const $ = id => document.getElementById(id);

function inicioRango(rango) {
  if (rango === 'sesion' && D.caja.sesion) return new Date(D.caja.sesion.desde);
  if (rango === 'todo') return new Date(0);
  const h = new Date(); h.setHours(0, 0, 0, 0); return h;
}

function calcularReporte(tipo, contado = null) {
  const desde = inicioRango(D.caja.sesion ? 'sesion' : 'hoy');
  const comps = D.comprobantes.filter(c => new Date(c.fecha) >= desde);
  // Las notas de venta anuladas no generan nota de crédito: se excluyen directamente
  const ventas = comps.filter(c => c.tipo !== '07' && !(c.tipo === 'NV' && c.estado === 'ANULADO'));
  const ncs = comps.filter(c => c.tipo === '07');
  const agrupar = (lista, key) => lista.reduce((acc, c) => {
    const k = key(c); acc[k] = acc[k] || { n: 0, total: 0 };
    acc[k].n++; acc[k].total = U.r2(acc[k].total + c.totales.total); return acc;
  }, {});
  const suma = (lista, f) => U.r2(lista.reduce((a, c) => a + f(c), 0));
  const efectivo = suma(ventas.filter(c => c.pago && c.pago.metodo === 'efectivo'), c => c.totales.total);
  const devEfectivo = suma(ncs.filter(c => c.pago && c.pago.metodo === 'efectivo'), c => c.totales.total);
  const fondo = D.caja.sesion ? D.caja.sesion.fondo : 0;
  return {
    tipo, cajero: D.caja.sesion ? D.caja.sesion.cajero : '-', desde: desde.toISOString(), hasta: new Date().toISOString(),
    porTipo: agrupar(ventas, c => c.tipo),
    porMetodo: agrupar(ventas, c => c.pago ? c.pago.metodo : 'otro'),
    nc: { n: ncs.length, total: suma(ncs, c => c.totales.total) },
    anulados: comps.filter(c => c.estado === 'ANULADO').length,
    ventasBrutas: suma(ventas, c => c.totales.total),
    gravada: U.r2(suma(ventas, c => c.totales.gravada) - suma(ncs, c => c.totales.gravada)),
    igv: U.r2(suma(ventas, c => c.totales.igv) - suma(ncs, c => c.totales.igv)),
    icbper: U.r2(suma(ventas, c => c.totales.icbper) - suma(ncs, c => c.totales.icbper)),
    neto: U.r2(suma(ventas, c => c.totales.total) - suma(ncs, c => c.totales.total)),
    cantidad: ventas.length,
    fondo, efectivo, devEfectivo,
    esperado: U.r2(fondo + efectivo - devEfectivo),
    contado,
  };
}

function render() {
  const s = D.caja.sesion;
  $('caja-titulo').innerHTML = D.caja.abierta ? '💰 Caja abierta <span class="chip ok">en turno</span>' : '💰 Caja cerrada <span class="chip warn">sin turno</span>';
  $('caja-sub').textContent = s ? `Cajero: ${s.cajero} · Apertura: ${U.fecha(s.desde)} ${U.hora(s.desde, false)} · Fondo inicial: ${U.money(s.fondo)}` : 'Abre la caja para iniciar un turno (también se abre desde el POS al cobrar).';
  $('btn-abrir').classList.toggle('hidden', D.caja.abierta);
  $('btn-cerrar').classList.toggle('hidden', !D.caja.abierta);
  $('btn-x').disabled = !D.caja.abierta;

  const r = calcularReporte('X');
  const pendientes = D.pedidos.filter(p => !p.comprobanteId && p.estado !== 'anulado');
  $('kpis').innerHTML = `
    <div class="card kpi"><div class="l">Venta neta</div><div class="v">${U.money(r.neto)}</div></div>
    <div class="card kpi"><div class="l">Comprobantes</div><div class="v">${r.cantidad}</div></div>
    <div class="card kpi"><div class="l">Ticket promedio</div><div class="v">${U.money(r.cantidad ? r.ventasBrutas / r.cantidad : 0)}</div></div>
    <div class="card kpi"><div class="l">Efectivo esperado</div><div class="v">${U.money(r.esperado)}</div></div>
    <div class="card kpi"><div class="l">IGV del turno</div><div class="v">${U.money(r.igv)}</div></div>
    <div class="card kpi"><div class="l">Pedidos por cobrar</div><div class="v">${pendientes.length}</div></div>`;

  const barras = (obj, nombre) => {
    const max = Math.max(1, ...Object.values(obj).map(v => v.total));
    return Object.entries(obj).map(([k, v]) => `
      <div style="margin-bottom:10px"><div class="row"><b>${U.esc(nombre(k))}</b><span class="muted small">${v.n} doc.</span><span class="spacer"></span><b class="num">${U.money(v.total)}</b></div>
      <div style="height:8px;background:var(--panel-2);border-radius:5px;margin-top:4px"><div style="height:100%;width:${(v.total / max) * 100}%;background:var(--accent);border-radius:5px"></div></div></div>`).join('') || '<p class="muted">Sin ventas en el turno.</p>';
  };
  $('por-metodo').innerHTML = barras(r.porMetodo, k => (Facturador.METODOS[k] ? Facturador.METODOS[k].icono + ' ' + Facturador.METODOS[k].nombre : k));
  $('por-tipo').innerHTML = barras(r.porTipo, k => Facturador.TIPOS[k] || k) + (r.nc.n ? `<p class="small" style="color:var(--bad)">Notas de crédito: ${r.nc.n} · -${U.money(r.nc.total)}</p>` : '');

  renderTabla();
  $('cierres').innerHTML = D.caja.historial.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Cajero</th><th>Apertura</th><th>Cierre</th><th class="right">Venta neta</th><th class="right">Esperado</th><th class="right">Contado</th><th class="right">Diferencia</th><th></th></tr></thead><tbody>
    ${D.caja.historial.map((z, i) => `<tr><td>${U.esc(z.cajero)}</td><td>${U.fecha(z.desde)} ${U.hora(z.desde, false)}</td><td>${U.fecha(z.hasta)} ${U.hora(z.hasta, false)}</td>
      <td class="right num">${U.money(z.neto)}</td><td class="right num">${U.money(z.esperado)}</td><td class="right num">${U.money(z.contado)}</td>
      <td class="right num" style="color:${Math.abs(z.contado - z.esperado) < 0.01 ? 'var(--ok)' : 'var(--bad)'}">${U.money(z.contado - z.esperado)}</td>
      <td><button class="btn sm" data-z="${i}">🖨️</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aún no hay cierres de caja.</p>';
  U.qsa('[data-z]').forEach(b => b.onclick = () => Ticket.imprimir(Ticket.reporte(D.caja.historial[b.dataset.z], D), { titulo: 'Reimprimiendo reporte Z…' }));
}

function filtrados() {
  const q = $('f-texto').value.trim().toLowerCase();
  const tipo = $('f-tipo').value;
  const desde = inicioRango($('f-rango').value);
  return D.comprobantes.filter(c => new Date(c.fecha) >= desde && (!tipo || c.tipo === tipo)
    && (!q || [Facturador.codigo(c), c.cliente.nombre, c.cliente.numDoc, c.numeroPedido].join(' ').toLowerCase().includes(q)));
}

function renderTabla() {
  const lista = filtrados();
  const chipSunat = c => {
    if (!c.sunat) return '<span class="chip warn">pendiente</span>';
    if (c.sunat.estado === 'ERROR') return '<span class="chip bad">error</span>';
    if (c.sunat.estado === 'NO APLICA') return '<span class="chip">interno</span>';
    return '<span class="chip ok">aceptado (sim)</span>';
  };
  $('tabla').innerHTML = lista.slice(0, 300).map(c => {
    const met = c.pago && Facturador.METODOS[c.pago.metodo];
    return `<tr>
      <td class="small">${U.fecha(c.fecha)}<br>${U.hora(c.fecha)}</td>
      <td><b>${Facturador.codigo(c)}</b><div class="small muted">${Facturador.TIPOS[c.tipo]}</div>
        ${c.estado === 'ANULADO' ? `<span class="chip bad">anulado${c.anuladoPor ? ' · ' + c.anuladoPor : ''}</span>` : ''}
        ${c.referencia ? `<span class="chip info">ref. ${c.referencia.serie}-${U.pad(c.referencia.numero, 8)}</span>` : ''}</td>
      <td>${U.esc(c.cliente.nombre)}<div class="small muted">${Facturador.DOC_IDENTIDAD[c.cliente.tipoDoc]} ${U.esc(c.cliente.numDoc)}</div></td>
      <td>${c.numeroPedido ? '#' + U.pad(c.numeroPedido, 3) : '—'}</td>
      <td>${met ? met.icono + ' ' + met.nombre : '—'}</td>
      <td class="right num"><b>${c.tipo === '07' ? '-' : ''}${U.money(c.totales.total)}</b></td>
      <td>${chipSunat(c)}</td>
      <td style="white-space:nowrap">
        <button class="btn sm" data-ver="${c.id}" title="Ver / reimprimir">🖨️</button>
        <button class="btn sm" data-json="${c.id}" title="Ver JSON para SUNAT">{ }</button>
        ${c.tipo !== '07' && c.estado !== 'ANULADO' ? `<button class="btn sm danger" data-anular="${c.id}" title="Anular">Anular</button>` : ''}
      </td></tr>`;
  }).join('') || '<tr><td colspan="8" class="muted" style="text-align:center;padding:30px">No hay comprobantes en este rango. Emite uno desde “Pedidos y cobro”.</td></tr>';
  U.qsa('[data-ver]').forEach(b => b.onclick = () => {
    const c = D.comprobantes.find(x => x.id === b.dataset.ver);
    Ticket.imprimir(Ticket.comprobante(c, D, { copia: true }), { titulo: `Reimprimiendo ${Facturador.codigo(c)}…` });
  });
  U.qsa('[data-json]').forEach(b => b.onclick = () => {
    const c = D.comprobantes.find(x => x.id === b.dataset.json);
    const json = JSON.stringify({ payload: Facturador.payload(c, D.empresa), respuesta: c.sunat }, null, 2);
    U.modal({
      title: `JSON · ${Facturador.codigo(c)}`, wide: true,
      body: `<p class="muted small">Estructura lista para mapear al proveedor de facturación electrónica (SUNAT / OSE / PSE).</p><pre class="json">${U.esc(json)}</pre>`,
      actions: [{ label: 'Copiar', onClick: () => { navigator.clipboard?.writeText(json); U.toast('Copiado', 'ok'); return false; } },
        { label: 'Descargar', cls: 'primary', onClick: () => U.descargar(`${D.empresa.ruc}-${c.tipo}-${Facturador.codigo(c)}.json`, json) }],
    });
  });
  U.qsa('[data-anular]').forEach(b => b.onclick = () => anular(b.dataset.anular));
}

/* ---------- Anulación (nota de crédito simulada) ---------- */
function anular(id) {
  const c = D.comprobantes.find(x => x.id === id);
  const esNV = c.tipo === 'NV';
  U.modal({
    title: esNV ? `Anular ${Facturador.codigo(c)}` : `Emitir nota de crédito para ${Facturador.codigo(c)}`,
    body: `${esNV ? '<p class="muted">La nota de venta es un documento interno: se marcará como anulada.</p>' : `
      <p class="muted">Un comprobante electrónico aceptado no se borra: se anula emitiendo una <b>nota de crédito electrónica</b> que lo referencia.</p>
      <div class="form-grid">
        <label class="field">Motivo (Catálogo 09)<select id="nc-mot">${Object.entries(Facturador.MOTIVOS_NC).map(([k, v]) => `<option value="${k}">${k} - ${v}</option>`).join('')}</select></label>
        <label class="field">Sustento<input id="nc-sus" value="Anulación solicitada por el cliente"></label>
      </div>`}
      <label class="row" style="margin-top:12px"><input type="checkbox" id="nc-stock" checked> Devolver productos al stock</label>
      <p class="small">Total a devolver: <b>${U.money(c.totales.total)}</b> vía ${c.pago ? Facturador.METODOS[c.pago.metodo].nombre : '-'}</p>`,
    actions: [{ label: 'Cancelar' }, {
      label: esNV ? 'Anular' : 'Emitir nota de crédito', cls: 'danger', onClick: async (close, root) => {
        const devolver = U.qs('#nc-stock', root).checked;
        const motivo = esNV ? null : U.qs('#nc-mot', root).value;
        const sustento = esNV ? '' : U.qs('#nc-sus', root).value.trim();
        const res = Store.update(d => {
          const orig = d.comprobantes.find(x => x.id === id);
          if (devolver) orig.items.forEach(i => { const p = d.productos.find(x => x.codigo === i.codigo); if (p && p.stock != null) p.stock += i.cantidad; });
          if (esNV) { orig.estado = 'ANULADO'; orig.anuladoPor = 'interno'; return { nc: null }; }
          const items = orig.items.map(i => ({ codigo: i.codigo, nombre: i.descripcion, precio: i.precioUnit, cantidad: i.cantidad, unidad: i.unidad, icbper: i.icbper > 0 }));
          const nc = Facturador.construir(d, {
            tipo: '07', items, descuento: orig.totales.descuento, cliente: orig.cliente, pago: orig.pago ? { metodo: orig.pago.metodo } : null,
            cajero: d.caja.sesion ? d.caja.sesion.cajero : orig.cajero,
            referencia: { tipo: orig.tipo, serie: orig.serie, numero: orig.numero, motivo, sustento },
          });
          nc.numeroPedido = orig.numeroPedido;
          d.comprobantes.unshift(nc);
          orig.estado = 'ANULADO'; orig.anuladoPor = Facturador.codigo(nc);
          return { nc: JSON.parse(JSON.stringify(nc)) };
        });
        if (!res.nc) { U.toast('Nota de venta anulada', 'warn'); return; }
        U.toast('Enviando nota de crédito (simulado)…');
        const sunat = await Facturador.emitir(res.nc, D.empresa);
        Store.update(d => { d.comprobantes.find(x => x.id === res.nc.id).sunat = sunat; });
        res.nc.sunat = sunat;
        Ticket.imprimir(Ticket.comprobante(res.nc, D), { titulo: `Imprimiendo nota de crédito ${Facturador.codigo(res.nc)}…` });
      },
    }],
  });
}

/* ---------- Apertura / cierre ---------- */
function abrirCaja() {
  U.modal({
    title: '🔓 Apertura de caja',
    body: `<div class="form-grid"><label class="field">Cajero<input id="a-caj" value="Cajero 1"></label>
      <label class="field">Fondo inicial (S/)<input id="a-fondo" type="number" min="0" step="0.1" value="200"></label></div>`,
    actions: [{ label: 'Cancelar' }, {
      label: 'Abrir caja', cls: 'primary', onClick: (c, root) => {
        const cajero = U.qs('#a-caj', root).value.trim() || 'Cajero 1';
        const fondo = Number(U.qs('#a-fondo', root).value) || 0;
        Store.update(d => { d.caja.abierta = true; d.caja.sesion = { id: U.uid(), cajero, fondo, desde: new Date().toISOString() }; });
        U.toast('Caja abierta', 'ok');
      },
    }],
  });
}

function cerrarCaja() {
  const r = calcularReporte('Z');
  const pendientes = D.pedidos.filter(p => !p.comprobanteId && p.estado !== 'anulado').length;
  U.modal({
    title: '🔒 Cierre de caja (Reporte Z)',
    body: `${pendientes ? `<p class="field-error">⚠ Hay ${pendientes} pedido(s) sin cobrar.</p>` : ''}
      <div class="resumen-cobro" style="margin-bottom:12px">
        <div class="tot-row"><span>Fondo inicial</span><span>${U.money(r.fondo)}</span></div>
        <div class="tot-row"><span>Ventas en efectivo</span><span>${U.money(r.efectivo)}</span></div>
        <div class="tot-row"><span>Devoluciones en efectivo</span><span>-${U.money(r.devEfectivo)}</span></div>
        <div class="tot-row big"><span>Efectivo esperado</span><span>${U.money(r.esperado)}</span></div>
      </div>
      <label class="field">Efectivo contado en caja (S/)<input id="z-cont" type="number" step="0.1" value="${U.f2(r.esperado)}"></label>
      <div class="small" id="z-dif" style="margin-top:6px"></div>`,
    onMount(root) {
      const upd = () => {
        const dif = U.r2((Number(U.qs('#z-cont', root).value) || 0) - r.esperado);
        U.qs('#z-dif', root).innerHTML = `Diferencia: <b style="color:${Math.abs(dif) < 0.01 ? 'var(--ok)' : 'var(--bad)'}">${U.money(dif)}</b> ${dif > 0 ? '(sobrante)' : dif < 0 ? '(faltante)' : '(cuadra)'}`;
      };
      U.qs('#z-cont', root).oninput = upd; upd();
    },
    actions: [{ label: 'Cancelar' }, {
      label: 'Cerrar caja e imprimir Z', cls: 'danger', onClick: (c, root) => {
        const z = calcularReporte('Z', U.r2(Number(U.qs('#z-cont', root).value) || 0));
        Store.update(d => { d.caja.historial.unshift(z); d.caja.abierta = false; d.caja.sesion = null; });
        Ticket.imprimir(Ticket.reporte(z, D), { titulo: 'Imprimiendo reporte Z…' });
      },
    }],
  });
}

/* ---------- Exportaciones ---------- */
function exportarCSV() {
  const filas = [['Fecha', 'Hora', 'Tipo', 'Serie', 'Numero', 'TipoDocCliente', 'NumDocCliente', 'Cliente', 'Gravada', 'IGV', 'ICBPER', 'Total', 'MedioPago', 'Estado', 'Referencia']];
  filtrados().slice().reverse().forEach(c => filas.push([
    U.fecha(c.fecha), U.hora(c.fecha), c.tipo, c.serie, c.numero, c.cliente.tipoDoc, c.cliente.numDoc, c.cliente.nombre,
    U.f2(c.totales.gravada), U.f2(c.totales.igv), U.f2(c.totales.icbper), (c.tipo === '07' ? '-' : '') + U.f2(c.totales.total),
    c.pago ? c.pago.metodo : '', c.estado, c.referencia ? `${c.referencia.serie}-${c.referencia.numero}` : '',
  ]));
  const csv = '﻿' + filas.map(f => f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  U.descargar(`registro-ventas-${D.empresa.ruc}-${U.fechaISO(new Date())}.csv`, csv, 'text/csv;charset=utf-8');
}
function exportarJSON() {
  const lote = filtrados().filter(c => c.tipo !== 'NV').map(c => Facturador.payload(c, D.empresa));
  U.descargar(`lote-comprobantes-${D.empresa.ruc}-${U.fechaISO(new Date())}.json`, JSON.stringify(lote, null, 2));
}

Store.subscribe(d => { D = d; render(); });
UI.topbar('caja');
$('btn-abrir').onclick = abrirCaja;
$('btn-cerrar').onclick = cerrarCaja;
$('btn-x').onclick = () => Ticket.imprimir(Ticket.reporte(calcularReporte('X'), D), { titulo: 'Imprimiendo reporte X…' });
$('btn-csv').onclick = exportarCSV;
$('btn-json').onclick = exportarJSON;
['f-texto', 'f-tipo', 'f-rango'].forEach(id => $(id).addEventListener('input', renderTabla));
if (!D.caja.sesion) $('f-rango').value = 'hoy';
render();
