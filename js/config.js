/* ==========================================================
   Configuración: empresa, comprobantes, productos y datos
   ========================================================== */
let D = Store.get();
const $ = id => document.getElementById(id);

const CAMPOS_EMPRESA = [
  ['ruc', 'RUC'], ['razonSocial', 'Razón social'], ['nombreComercial', 'Nombre comercial'],
  ['direccion', 'Dirección fiscal'], ['telefono', 'Teléfono'], ['email', 'Correo'], ['web', 'Web'],
  ['logo', 'Logo (emoji)'], ['color', 'Color de marca', 'color'], ['mensaje', 'Mensaje al pie del ticket'], ['promo', 'Texto promocional (mostrador)'],
];

function renderForms() {
  $('f-empresa').innerHTML = CAMPOS_EMPRESA.map(([k, l, t]) => `
    <label class="field" ${['direccion', 'mensaje', 'promo', 'razonSocial'].includes(k) ? 'style="grid-column:1/-1"' : ''}>${l}
      <input data-e="${k}" type="${t || 'text'}" value="${U.esc(D.empresa[k] || '')}"></label>`).join('');
  const c = D.config;
  $('f-config').innerHTML = `
    <label class="field">Tasa IGV (%)<input data-c="igv" type="number" step="0.5" min="0" value="${c.igv}">
      <span class="small muted" style="font-weight:400">18% general. Restaurantes MYPE pueden aplicar la tasa reducida de la Ley 31556.</span></label>
    <label class="field">ICBPER por bolsa (S/)<input data-c="icbper" type="number" step="0.05" min="0" value="${c.icbper}"></label>
    <label class="field">Boleta: monto que exige DNI (S/)<input data-c="limiteBoletaDNI" type="number" step="1" min="0" value="${c.limiteBoletaDNI}"></label>
    <label class="field">Ancho de ticket<select data-c="anchoTicket"><option value="80" ${c.anchoTicket == 80 ? 'selected' : ''}>80 mm</option><option value="58" ${c.anchoTicket == 58 ? 'selected' : ''}>58 mm</option></select></label>
    <label class="row"><input type="checkbox" data-c="autoComanda" ${c.autoComanda ? 'checked' : ''}> Imprimir ${D.textos.comanda.toLowerCase()} automáticamente</label>
    <label class="row"><input type="checkbox" data-c="sonido" ${c.sonido ? 'checked' : ''}> Sonido de impresora</label>
    <label class="row"><input type="checkbox" data-c="voz" ${c.voz ? 'checked' : ''}> Voz en el mostrador</label>`;
  const nombres = { '03': 'Boleta', '01': 'Factura', 'NV': 'Nota de venta', '07-03': 'N. crédito (boleta)', '07-01': 'N. crédito (factura)' };
  $('f-series').innerHTML = Object.keys(D.series).map(k => `
    <label class="field">${nombres[k] || k}<input data-s="${k}" maxlength="4" value="${U.esc(D.series[k])}">
      <span class="small muted" style="font-weight:400">Último N°: ${D.correlativos[D.series[k]] || 0}</span></label>`).join('');
}

function guardar() {
  const ruc = U.qs('[data-e="ruc"]').value.trim();
  if (!U.validarRUC(ruc)) return U.toast('El RUC del emisor no es válido', 'bad');
  const series = {};
  for (const el of U.qsa('[data-s]')) {
    const v = el.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(v)) return U.toast(`Serie inválida: ${v} (4 caracteres)`, 'bad');
    series[el.dataset.s] = v;
  }
  Store.update(d => {
    U.qsa('[data-e]').forEach(el => { d.empresa[el.dataset.e] = el.value.trim(); });
    U.qsa('[data-c]').forEach(el => {
      const k = el.dataset.c;
      d.config[k] = el.type === 'checkbox' ? el.checked : (el.tagName === 'SELECT' || el.type === 'number' ? Number(el.value) : el.value);
    });
    d.series = series;
  });
  U.toast('Configuración guardada', 'ok');
  UI.topbar('config');
}

/* ---------- Productos ---------- */
const opcionesATexto = ops => (ops || []).map(o => `${o.nombre}: ${o.valores.join(', ')}`).join(' | ');
const textoAOpciones = txt => txt.split('|').map(s => s.trim()).filter(Boolean).map(s => {
  const [n, v = ''] = s.split(':');
  return { nombre: n.trim(), valores: v.split(',').map(x => x.trim()).filter(Boolean) };
}).filter(o => o.nombre && o.valores.length);

function renderProductos() {
  const q = $('p-buscar').value.trim().toLowerCase();
  $('p-tabla').innerHTML = D.productos.filter(p => !q || (p.nombre + p.codigo).toLowerCase().includes(q)).map(p => `
    <tr><td style="font-size:22px">${p.emoji || ''}</td><td>${U.esc(p.codigo)}</td><td><b>${U.esc(p.nombre)}</b>${p.icbper ? ' <span class="chip">ICBPER</span>' : ''}${p.sinPreparacion ? ' <span class="chip">sin preparación</span>' : ''}</td>
      <td>${U.esc((D.categorias.find(c => c.id === p.categoria) || {}).nombre || '-')}</td>
      <td class="small muted">${U.esc(opcionesATexto(p.opciones)) || '—'}</td>
      <td class="right num">${U.money(p.precio)}</td><td class="right num">${p.stock == null ? '∞' : p.stock}</td>
      <td><input type="checkbox" data-act="${p.id}" ${p.activo !== false ? 'checked' : ''}></td>
      <td style="white-space:nowrap"><button class="btn sm" data-ed="${p.id}">✎</button> <button class="btn sm danger" data-del="${p.id}">✕</button></td></tr>`).join('');
  U.qsa('[data-act]').forEach(el => el.onchange = () => Store.update(d => { d.productos.find(p => p.id === el.dataset.act).activo = el.checked; }));
  U.qsa('[data-ed]').forEach(b => b.onclick = () => editarProducto(D.productos.find(p => p.id === b.dataset.ed)));
  U.qsa('[data-del]').forEach(b => b.onclick = async () => {
    if (await U.confirmar('Eliminar producto', '¿Eliminar este producto del catálogo?', 'Eliminar', 'danger')) Store.update(d => { d.productos = d.productos.filter(p => p.id !== b.dataset.del); });
  });
}

function editarProducto(p) {
  const nuevo = !p;
  p = p || { id: U.uid(), codigo: '', nombre: '', precio: 0, categoria: D.categorias[0].id, emoji: '📦', opciones: [], stock: null, activo: true, unidad: 'NIU' };
  U.modal({
    title: nuevo ? 'Nuevo producto' : 'Editar producto', wide: true,
    body: `<div class="form-grid">
      <label class="field">Código<input id="e-cod" value="${U.esc(p.codigo)}"></label>
      <label class="field">Emoji<input id="e-emo" value="${U.esc(p.emoji || '')}"></label>
      <label class="field" style="grid-column:1/-1">Nombre<input id="e-nom" value="${U.esc(p.nombre)}"></label>
      <label class="field">Precio con IGV (S/)<input id="e-pre" type="number" step="0.1" min="0" value="${p.precio}"></label>
      <label class="field">Categoría<select id="e-cat">${D.categorias.map(c => `<option value="${c.id}" ${c.id === p.categoria ? 'selected' : ''}>${U.esc(c.nombre)}</option>`).join('')}</select></label>
      <label class="field">Stock (vacío = sin control)<input id="e-stk" type="number" step="1" min="0" value="${p.stock == null ? '' : p.stock}"></label>
      <label class="field">Unidad SUNAT<select id="e-um"><option value="NIU" ${p.unidad === 'NIU' ? 'selected' : ''}>NIU - Unidad (bienes)</option><option value="ZZ" ${p.unidad === 'ZZ' ? 'selected' : ''}>ZZ - Servicio</option></select></label>
      <label class="field" style="grid-column:1/-1">Opciones (formato: <code>Talla: S, M, L | Color: Negro, Blanco</code>)<input id="e-ops" value="${U.esc(opcionesATexto(p.opciones))}"></label>
      <label class="row"><input type="checkbox" id="e-icb" ${p.icbper ? 'checked' : ''}> Afecto a ICBPER (bolsa plástica)</label>
      <label class="row"><input type="checkbox" id="e-sp" ${p.sinPreparacion ? 'checked' : ''}> No requiere preparación / despacho</label>
    </div>`,
    actions: [{ label: 'Cancelar' }, {
      label: 'Guardar', cls: 'primary', onClick: (c, root) => {
        const v = id => U.qs(id, root).value.trim();
        if (!v('#e-nom') || !v('#e-cod')) { U.toast('Código y nombre son obligatorios', 'bad'); return false; }
        const datos = {
          codigo: v('#e-cod'), emoji: v('#e-emo'), nombre: v('#e-nom'), precio: U.r2(Number(v('#e-pre')) || 0), categoria: v('#e-cat'),
          stock: v('#e-stk') === '' ? null : Math.max(0, parseInt(v('#e-stk'), 10)), unidad: v('#e-um'), opciones: textoAOpciones(v('#e-ops')),
          icbper: U.qs('#e-icb', root).checked, sinPreparacion: U.qs('#e-sp', root).checked,
        };
        Store.update(d => {
          if (nuevo) d.productos.push(Object.assign(p, datos));
          else Object.assign(d.productos.find(x => x.id === p.id), datos);
        });
        U.toast('Producto guardado', 'ok');
      },
    }],
  });
}

Store.subscribe(d => { D = d; renderProductos(); });
UI.topbar('config');
renderForms();
renderProductos();
$('btn-guardar').onclick = guardar;
$('btn-nuevo').onclick = () => editarProducto(null);
$('p-buscar').oninput = renderProductos;
$('btn-prueba').onclick = () => {
  const d = Store.get();
  Ticket.imprimir(`<div class="${Ticket.clase(d)}"><div class="marca">SIMULACIÓN</div>${Ticket.bannerSim()}${Ticket.cabeceraEmpresa(d.empresa)}
    <div class="hr2"></div><div class="c xl">TICKET DE PRUEBA</div><div class="hr"></div>
    <div>Ancho: ${d.config.anchoTicket} mm</div><div>Fecha: ${U.fecha(new Date())} ${U.hora(new Date())}</div>
    <div>ABCDEFGHIJKLMNÑOPQRSTUVWXYZ 0123456789</div><div class="hr"></div>
    <div class="qr" data-qr="${d.empresa.ruc}|PRUEBA|SIMULACION|"></div>
    <div class="sim">SIMULACIÓN · SIN VALOR TRIBUTARIO</div><div class="corte">- - - - ✂ - - - -</div></div>`, { titulo: 'Imprimiendo ticket de prueba…', d });
};
$('btn-export').onclick = () => U.descargar(`respaldo-${D.id}-${U.fechaISO(new Date())}.json`, Store.exportar());
$('in-import').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { Store.importar(await f.text()); U.toast('Respaldo importado', 'ok'); setTimeout(() => location.reload(), 600); }
  catch (err) { U.toast('No se pudo importar: ' + err.message, 'bad'); }
};
$('btn-demo').onclick = generarDemo;
$('btn-reset').onclick = async () => {
  if (await U.confirmar('Reiniciar empresa', 'Se borrarán pedidos, comprobantes, caja y cambios de configuración de esta empresa.', 'Reiniciar', 'danger')) {
    await Store.reset(); location.reload();
  }
};
