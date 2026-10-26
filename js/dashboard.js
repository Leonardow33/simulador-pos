/* ==========================================================
   Dashboard de ventas: indicadores y gráficos del periodo.
   Usa los mismos comprobantes que la caja (venta neta = ventas
   menos notas de crédito; las notas de venta anuladas no cuentan).
   ========================================================== */
let D = Store.get();
let rango = localStorage.getItem('simpos:dash:rango') || '7';
let desde, hasta; // [desde, hasta)
const $ = id => document.getElementById(id);
const DIA = 86400000;

/* ---------- Rango de fechas ---------- */
const inicioDia = f => { const d = new Date(f); d.setHours(0, 0, 0, 0); return d; };
const sumarDias = (f, n) => { const d = new Date(f); d.setDate(d.getDate() + n); return d; };
const aInput = f => U.fechaISO(f);
const deInput = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function calcularRango() {
  const hoy = inicioDia(new Date()), manana = sumarDias(hoy, 1);
  if (rango === 'hoy') { desde = hoy; hasta = manana; }
  else if (rango === '7') { desde = sumarDias(hoy, -6); hasta = manana; }
  else if (rango === '30') { desde = sumarDias(hoy, -29); hasta = manana; }
  else if (rango === 'mes') { desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1); hasta = manana; }
  else if (rango === 'todo') {
    const fechas = D.comprobantes.map(c => +new Date(c.fecha));
    desde = fechas.length ? inicioDia(Math.min(...fechas)) : hoy; hasta = manana;
  }
  // 'custom': desde/hasta ya vienen de los campos de fecha
  $('desde').value = aInput(desde);
  $('hasta').value = aInput(sumarDias(hasta, -1));
  U.qsa('#rango button').forEach(b => b.classList.toggle('on', b.dataset.r === rango));
}

/* ---------- Agregación ---------- */
const esVenta = c => c.tipo !== '07' && !(c.tipo === 'NV' && c.estado === 'ANULADO');
const signo = c => (c.tipo === '07' ? -1 : 1);
const cuenta = c => esVenta(c) || c.tipo === '07';

function movimientos(a, b) {
  return D.comprobantes.filter(c => { const f = new Date(c.fecha); return f >= a && f < b && cuenta(c); });
}

function resumen(lista) {
  const ventas = lista.filter(esVenta);
  const neto = U.r2(lista.reduce((s, c) => s + signo(c) * c.totales.total, 0));
  const bruto = ventas.reduce((s, c) => s + c.totales.total, 0);
  return {
    neto,
    n: ventas.length,
    ticket: ventas.length ? U.r2(bruto / ventas.length) : 0,
    igv: U.r2(lista.reduce((s, c) => s + signo(c) * c.totales.igv, 0)),
    unidades: lista.reduce((s, c) => s + signo(c) * c.items.reduce((a, i) => a + i.cantidad, 0), 0),
    nc: lista.filter(c => c.tipo === '07'),
  };
}

function agrupar(lista, clave) {
  const m = new Map();
  lista.forEach(c => {
    const k = clave(c);
    const g = m.get(k) || { valor: 0, n: 0 };
    g.valor = U.r2(g.valor + signo(c) * c.totales.total);
    if (esVenta(c)) g.n++;
    m.set(k, g);
  });
  return m;
}

/* ---------- Indicadores ---------- */
function delta(actual, previo) {
  if (rango === 'todo' || !previo) return '<span class="small muted">sin periodo anterior para comparar</span>';
  const p = (actual - previo) / Math.abs(previo) * 100;
  if (Math.abs(p) < 0.5) return '<span class="chip">＝ igual que el periodo anterior</span>';
  const sube = p > 0;
  return `<span class="chip ${sube ? 'ok' : 'bad'}">${sube ? '▲' : '▼'} ${sube ? '+' : ''}${p.toFixed(0)}% vs periodo anterior</span>`;
}

function renderKpis(r, prev) {
  $('kpis').innerHTML = `
    <div class="card kpi"><div class="l">Venta neta</div><div class="v">${U.money(r.neto)}</div>${delta(r.neto, prev.neto)}</div>
    <div class="card kpi"><div class="l">N° de ventas</div><div class="v">${r.n}</div>${delta(r.n, prev.n)}</div>
    <div class="card kpi"><div class="l">Ticket promedio</div><div class="v">${U.money(r.ticket)}</div>${delta(r.ticket, prev.ticket)}</div>
    <div class="card kpi"><div class="l">Unidades vendidas</div><div class="v">${r.unidades}</div>${delta(r.unidades, prev.unidades)}</div>
    <div class="card kpi"><div class="l">IGV del periodo</div><div class="v">${U.money(r.igv)}</div><span class="small muted">referencia para el contador</span></div>
    <div class="card kpi"><div class="l">Anulaciones</div><div class="v">${r.nc.length}</div><span class="small muted">${r.nc.length ? '−' + U.money(r.nc.reduce((s, c) => s + c.totales.total, 0)) + ' en notas de crédito' : 'ninguna nota de crédito'}</span></div>`;
}

/* ---------- Tooltip ---------- */
const tip = $('tip');
function mostrarTip(e, html) {
  tip.innerHTML = html; tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY - r.height - 10;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y < 8) y = e.clientY + 16;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
const ocultarTip = () => { tip.hidden = true; };

/* ---------- Gráfico de columnas (SVG) ---------- */
/* Máximo "redondo" para 4 divisiones del eje (ej. 0-100-200-300-400) */
function niceMax(v) {
  if (v <= 0) return 40;
  const paso = v / 4, p = Math.pow(10, Math.floor(Math.log10(paso))), n = paso / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p * 4;
}
function columnas(el, datos, { alto = 230 } = {}) {
  if (!datos.some(d => d.valor !== 0)) { el.innerHTML = '<div class="chart-vacio">Sin ventas en este periodo</div>'; return; }
  const W = Math.max(280, el.clientWidth), H = alto;
  const pl = 58, pr = 8, pt = 12, pb = 26, pw = W - pl - pr, ph = H - pt - pb;
  const maxV = niceMax(Math.max(...datos.map(d => d.valor))), minV = Math.min(0, ...datos.map(d => d.valor));
  const minN = minV < 0 ? -niceMax(-minV) : 0;
  const y = v => pt + ph - (v - minN) / (maxV - minN) * ph;
  const band = pw / datos.length, bw = Math.max(3, Math.min(46, band - 2 * Math.max(2, band * 0.15)));
  const cada = Math.max(1, Math.ceil(datos.length / Math.max(1, Math.floor(pw / 46))));
  const ticks = [0, 1, 2, 3, 4].map(i => minN + (maxV - minN) * i / 4);
  const r = Math.min(4, bw / 2);
  const barra = (x, v) => {
    const y0 = y(0), y1 = y(v), h = Math.abs(y1 - y0);
    if (h < 0.5) return '';
    const rr = Math.min(r, h);
    if (v >= 0) return `M${x},${y0}V${y1 + rr}Q${x},${y1} ${x + rr},${y1}H${x + bw - rr}Q${x + bw},${y1} ${x + bw},${y1 + rr}V${y0}Z`;
    return `M${x},${y0}V${y1 - rr}Q${x},${y1} ${x + rr},${y1}H${x + bw - rr}Q${x + bw},${y1} ${x + bw},${y1 - rr}V${y0}Z`;
  };
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Gráfico de columnas">
    ${ticks.map(t => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}"/>
      <text class="ax" x="${pl - 8}" y="${y(t) + 4}" text-anchor="end">${t >= 1000 || t <= -1000 ? (t / 1000).toFixed(t % 1000 ? 1 : 0) + 'k' : Math.round(t)}</text>`).join('')}
    <line class="base" x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}"/>
    ${datos.map((d, i) => {
      const x = pl + i * band + (band - bw) / 2;
      return `<g class="col" data-i="${i}">
        <rect class="hit" x="${pl + i * band}" y="${pt}" width="${band}" height="${ph}"/>
        <path class="bar" d="${barra(x, d.valor)}"/>
        ${i % cada === 0 ? `<text class="ax" x="${pl + i * band + band / 2}" y="${H - 8}" text-anchor="middle">${U.esc(d.label)}</text>` : ''}
      </g>`;
    }).join('')}
  </svg>`;
  U.qsa('.col', el).forEach(g => {
    const d = datos[g.dataset.i];
    g.onmousemove = e => mostrarTip(e, `<b>${U.esc(d.titulo || d.label)}</b><br>${U.money(d.valor)}${d.n != null ? `<br><span>${d.n} venta${d.n === 1 ? '' : 's'}</span>` : ''}`);
    g.onmouseleave = ocultarTip;
  });
}

/* ---------- Barras horizontales (HTML) ---------- */
function barras(el, datos, max = 8) {
  datos = datos.filter(d => d.valor !== 0).sort((a, b) => b.valor - a.valor);
  if (datos.length > max) {
    const resto = datos.slice(max - 1);
    datos = datos.slice(0, max - 1).concat({ label: `Otros (${resto.length})`, valor: U.r2(resto.reduce((s, d) => s + d.valor, 0)), extra: '' });
  }
  if (!datos.length) { el.innerHTML = '<div class="chart-vacio">Sin ventas en este periodo</div>'; return; }
  const top = Math.max(...datos.map(d => Math.abs(d.valor)));
  el.innerHTML = `<div class="hbars">${datos.map((d, i) => `
    <div class="hbar" data-i="${i}">
      <span class="hb-l" title="${U.esc(d.label)}">${U.esc(d.label)}</span>
      <span class="hb-t"><span class="hb-f" style="width:${Math.max(1, Math.abs(d.valor) / top * 100)}%"></span></span>
      <span class="hb-v num">${U.money(d.valor)}${d.extra ? ` <span class="muted">${U.esc(d.extra)}</span>` : ''}</span>
    </div>`).join('')}</div>`;
  U.qsa('.hbar', el).forEach(r => {
    const d = datos[r.dataset.i];
    r.onmousemove = e => mostrarTip(e, `<b>${U.esc(d.label)}</b><br>${U.money(d.valor)}${d.tip ? '<br>' + U.esc(d.tip) : ''}`);
    r.onmouseleave = ocultarTip;
  });
}

function tabla(el, cols, filas) {
  el.innerHTML = filas.length ? `<table class="table"><thead><tr>${cols.map((c, i) => `<th class="${i ? 'right' : ''}">${c}</th>`).join('')}</tr></thead>
    <tbody>${filas.map(f => `<tr>${f.map((v, i) => `<td class="${i ? 'right num' : ''}">${U.esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="muted small">Sin datos.</p>';
}

/* ---------- Render principal ---------- */
function render() {
  calcularRango();
  const lista = movimientos(desde, hasta);
  const dur = hasta - desde;
  const r = resumen(lista), prev = resumen(movimientos(new Date(+desde - dur), desde));
  const dias = Math.round(dur / DIA);
  $('periodo').textContent = dias === 1 ? U.fecha(desde) : `${U.fecha(desde)} – ${U.fecha(sumarDias(hasta, -1))} · ${dias} días`;
  renderKpis(r, prev);

  // Serie temporal: por hora si es un solo día, si no por día
  const porHora = agrupar(lista, c => new Date(c.fecha).getHours());
  const horas = [...porHora.keys()];
  const hMin = horas.length ? Math.min(...horas, 8) : 8, hMax = horas.length ? Math.max(...horas, 20) : 20;
  const serieHora = [];
  for (let h = hMin; h <= hMax; h++) { const g = porHora.get(h) || { valor: 0, n: 0 }; serieHora.push({ label: `${h}h`, titulo: `${U.pad(h, 2)}:00 – ${U.pad(h, 2)}:59`, valor: g.valor, n: g.n }); }

  let serieTiempo;
  if (dias === 1) {
    $('t-tiempo').textContent = 'Ventas del día por hora';
    serieTiempo = serieHora;
  } else {
    $('t-tiempo').textContent = 'Ventas por día';
    const porDia = agrupar(lista, c => U.fechaISO(c.fecha));
    serieTiempo = [];
    for (let f = new Date(desde); f < hasta; f = sumarDias(f, 1)) {
      const g = porDia.get(U.fechaISO(f)) || { valor: 0, n: 0 };
      const dsem = f.toLocaleDateString('es-PE', { weekday: 'short' });
      serieTiempo.push({ label: dias <= 14 ? `${dsem} ${f.getDate()}` : `${f.getDate()}/${f.getMonth() + 1}`, titulo: f.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }), valor: g.valor, n: g.n });
    }
  }
  columnas($('ch-tiempo'), serieTiempo);
  tabla($('tb-tiempo'), [dias === 1 ? 'Hora' : 'Día', 'Ventas', 'Venta neta'], serieTiempo.map(d => [d.titulo, d.n, U.money(d.valor)]));

  $('ch-hora').closest('.dash-card').classList.toggle('hidden', dias === 1);
  $('ch-hora').closest('.two').classList.toggle('solo', dias === 1);
  columnas($('ch-hora'), serieHora, { alto: 200 });
  tabla($('tb-hora'), ['Hora', 'Ventas', 'Venta neta'], serieHora.filter(d => d.n || d.valor).map(d => [d.titulo, d.n, U.money(d.valor)]));

  // Productos (por importe, con unidades)
  const prods = new Map();
  lista.forEach(c => c.items.forEach(i => {
    const nombre = i.descripcion.replace(/\s*\(.*\)$/, '');
    const p = prods.get(nombre) || { valor: 0, unidades: 0 };
    p.valor = U.r2(p.valor + signo(c) * i.total); p.unidades += signo(c) * i.cantidad;
    prods.set(nombre, p);
  }));
  const datosProd = [...prods].map(([k, v]) => ({ label: k, valor: v.valor, extra: `(${v.unidades})`, tip: `${v.unidades} unidades` }));
  barras($('ch-productos'), datosProd);
  tabla($('tb-productos'), ['Producto', 'Unidades', 'Importe'], datosProd.sort((a, b) => b.valor - a.valor).map(d => [d.label, d.tip.split(' ')[0], U.money(d.valor)]));

  // Medios de pago
  const pagos = agrupar(lista, c => (c.pago && c.pago.metodo) || 'otro');
  const datosPago = [...pagos].map(([k, g]) => {
    const m = Facturador.METODOS[k];
    return { label: m ? `${m.icono} ${m.nombre}` : k, valor: g.valor, tip: `${g.n} venta${g.n === 1 ? '' : 's'}`, n: g.n };
  });
  barras($('ch-pago'), datosPago);
  tabla($('tb-pago'), ['Medio de pago', 'Ventas', 'Venta neta'], datosPago.map(d => [d.label, d.n, U.money(d.valor)]));

  // Canales
  const canales = agrupar(lista, c => c.canal || 'sin canal');
  const datosCanal = [...canales].map(([k, g]) => {
    const ca = D.canales.find(x => x.id === k);
    return { label: ca ? `${ca.icono} ${ca.nombre}` : 'Sin canal', valor: g.valor, tip: `${g.n} venta${g.n === 1 ? '' : 's'}`, n: g.n };
  });
  barras($('ch-canal'), datosCanal);
  tabla($('tb-canal'), ['Canal', 'Ventas', 'Venta neta'], datosCanal.map(d => [d.label, d.n, U.money(d.valor)]));

  // Últimas ventas
  $('ultimas').innerHTML = lista.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 10).map(c => {
    const m = c.pago && Facturador.METODOS[c.pago.metodo];
    return `<tr><td class="small">${U.fecha(c.fecha)} ${U.hora(c.fecha, false)}</td>
      <td><b>${Facturador.codigo(c)}</b> <span class="small muted">${Facturador.TIPOS[c.tipo]}</span>${c.estado === 'ANULADO' ? ' <span class="chip bad">anulado</span>' : ''}</td>
      <td>${U.esc(c.cliente.nombre)}</td><td>${m ? m.icono + ' ' + m.nombre : '—'}</td>
      <td class="right num"><b>${c.tipo === '07' ? '−' : ''}${U.money(c.totales.total)}</b></td></tr>`;
  }).join('') || '<tr><td colspan="5" class="muted" style="text-align:center;padding:24px">Sin ventas en este periodo.</td></tr>';
}

/* ---------- Exportar ---------- */
function exportarCSV() {
  const filas = [['Fecha', 'Hora', 'Comprobante', 'Tipo', 'Cliente', 'DocCliente', 'MedioPago', 'Canal', 'OpGravada', 'IGV', 'ICBPER', 'Total']];
  movimientos(desde, hasta).forEach(c => {
    const s = signo(c);
    filas.push([U.fecha(c.fecha), U.hora(c.fecha), Facturador.codigo(c), Facturador.TIPOS[c.tipo], c.cliente.nombre, c.cliente.numDoc,
      c.pago ? c.pago.metodo : '', c.canal || '', U.f2(s * c.totales.gravada), U.f2(s * c.totales.igv), U.f2(s * c.totales.icbper), U.f2(s * c.totales.total)]);
  });
  const csv = '﻿' + filas.map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  U.descargar(`ventas-${D.empresa.ruc}-${aInput(desde)}_${aInput(sumarDias(hasta, -1))}.csv`, csv, 'text/csv;charset=utf-8');
}

/* ---------- Eventos ---------- */
U.qsa('#rango button').forEach(b => b.onclick = () => {
  rango = b.dataset.r; localStorage.setItem('simpos:dash:rango', rango); render();
});
['desde', 'hasta'].forEach(id => $(id).onchange = () => {
  if (!$('desde').value || !$('hasta').value) return;
  let a = deInput($('desde').value), b = sumarDias(deInput($('hasta').value), 1);
  if (b <= a) b = sumarDias(a, 1);
  rango = 'custom'; desde = a; hasta = b; render();
});
$('btn-csv').onclick = exportarCSV;
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(render, 150); });
Store.subscribe(d => { D = d; render(); });
UI.topbar('dashboard');
if (!['hoy', '7', '30', 'mes', 'todo'].includes(rango)) rango = '7';
render();
