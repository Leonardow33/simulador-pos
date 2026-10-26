/* ==========================================================
   Tickets: comprobante, comanda, reportes de caja
   e impresora térmica simulada.
   ========================================================== */
const Ticket = {
  clase(d) { return 'ticket' + (Number(d.config.anchoTicket) === 58 ? ' w58' : ''); },

  cabeceraEmpresa(e) {
    return `
      <div class="logo">${e.logo}</div>
      <div class="c b" style="font-size:1.15em">${U.esc(e.nombreComercial)}</div>
      <div class="c b">${U.esc(e.razonSocial)}</div>
      <div class="c">RUC: ${U.esc(e.ruc)}</div>
      <div class="c">${U.esc(e.direccion)}</div>
      <div class="c">Telf: ${U.esc(e.telefono)}${e.email ? ' · ' + U.esc(e.email) : ''}</div>`;
  },

  bannerSim(texto = 'TICKET DE SIMULACIÓN') {
    return `<div class="sim inv">*** ${texto} ***</div>`;
  },

  /** Ticket del comprobante (boleta / factura / nota de crédito / nota de venta) */
  comprobante(c, d, { copia = false } = {}) {
    const e = d.empresa;
    const tipoNombre = Facturador.TIPOS[c.tipo];
    const docCli = Facturador.DOC_IDENTIDAD[c.cliente.tipoDoc] || 'DOC.';
    const canal = d.canales.find(x => x.id === c.canal);
    const filas = c.items.map(i => `
      <tr><td colspan="4">${U.esc(i.descripcion)}</td></tr>
      <tr><td>${i.cantidad}</td><td>${i.unidad}</td><td class="r">${U.f2(i.precioUnit)}</td><td class="r">${U.f2(i.total)}</td></tr>`).join('');
    const t = c.totales;
    const pago = c.pago || {};
    const met = Facturador.METODOS[pago.metodo];
    return `
    <div class="${this.clase(d)}">
      <div class="marca">SIMULACIÓN</div>
      ${this.bannerSim()}
      ${this.cabeceraEmpresa(e)}
      <div class="hr2"></div>
      <div class="c b" style="font-size:1.1em">${tipoNombre}</div>
      <div class="c xl">${Facturador.codigo(c)}</div>
      ${copia ? '<div class="c b">— REIMPRESIÓN / COPIA —</div>' : ''}
      ${c.estado === 'ANULADO' ? '<div class="sim">ANULADO</div>' : ''}
      <div class="hr"></div>
      <div class="kv"><span>Fecha emisión:</span><span>${U.fecha(c.fecha)} ${U.hora(c.fecha)}</span></div>
      <div class="kv"><span>Moneda:</span><span>SOLES (PEN)</span></div>
      <div class="kv"><span>Cajero:</span><span>${U.esc(c.cajero)}</span></div>
      ${c.numeroPedido ? `<div class="kv"><span>Pedido N°:</span><span class="b">${U.pad(c.numeroPedido, 3)}</span></div>` : ''}
      ${canal ? `<div class="kv"><span>Atención:</span><span>${U.esc(canal.nombre)}${c.mesa ? ' · Mesa ' + U.esc(c.mesa) : ''}</span></div>` : ''}
      <div class="hr"></div>
      <div><span class="b">${c.tipo === '01' || c.cliente.tipoDoc === '6' ? 'Razón social' : 'Cliente'}:</span> ${U.esc(c.cliente.nombre)}</div>
      <div><span class="b">${docCli}:</span> ${U.esc(c.cliente.numDoc || '-')}</div>
      ${c.cliente.direccion ? `<div><span class="b">Dirección:</span> ${U.esc(c.cliente.direccion)}</div>` : ''}
      ${c.referencia ? `
        <div class="hr"></div>
        <div><span class="b">Doc. que modifica:</span> ${c.referencia.tipo === '01' ? 'FACTURA' : 'BOLETA'} ${c.referencia.serie}-${U.pad(c.referencia.numero, 8)}</div>
        <div><span class="b">Motivo:</span> ${c.referencia.motivo} - ${U.esc(Facturador.MOTIVOS_NC[c.referencia.motivo] || '')}</div>
        ${c.referencia.sustento ? `<div><span class="b">Sustento:</span> ${U.esc(c.referencia.sustento)}</div>` : ''}` : ''}
      <div class="hr"></div>
      <table>
        <thead><tr><th>Cant</th><th>U.M.</th><th class="r">P.Unit</th><th class="r">Importe</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <div class="hr"></div>
      ${t.descuento ? `<div class="kv"><span>Descuento total:</span><span>-${U.f2(t.descuento)}</span></div>` : ''}
      ${c.tipo !== 'NV' ? `
        <div class="kv"><span>Op. gravada:</span><span>S/ ${U.f2(t.gravada)}</span></div>
        <div class="kv"><span>Op. exonerada:</span><span>S/ 0.00</span></div>
        <div class="kv"><span>Op. inafecta:</span><span>S/ 0.00</span></div>
        <div class="kv"><span>IGV (${d.config.igv}%):</span><span>S/ ${U.f2(t.igv)}</span></div>
        ${t.icbper ? `<div class="kv"><span>ICBPER:</span><span>S/ ${U.f2(t.icbper)}</span></div>` : ''}` : ''}
      <div class="kv tot"><span>IMPORTE TOTAL:</span><span>S/ ${U.f2(t.total)}</span></div>
      <div style="margin-top:4px">SON: ${c.leyenda}</div>
      ${c.pago ? `
        <div class="hr"></div>
        <div class="kv"><span>Forma de pago:</span><span>CONTADO</span></div>
        <div class="kv"><span>Medio de pago:</span><span>${met ? met.nombre.toUpperCase() : '-'}</span></div>
        ${pago.metodo === 'efectivo' ? `
          <div class="kv"><span>Recibido:</span><span>S/ ${U.f2(pago.recibido)}</span></div>
          <div class="kv b"><span>Vuelto:</span><span>S/ ${U.f2(pago.vuelto)}</span></div>` : ''}
        ${pago.referencia ? `<div class="kv"><span>N° operación:</span><span>${U.esc(pago.referencia)}</span></div>` : ''}` : ''}
      <div class="hr"></div>
      ${c.tipo !== 'NV' ? `
        <div class="qr" data-qr="${U.esc(Facturador.textoQR(c, e))}"></div>
        <div class="c small">Resumen (hash): ${c.sunat ? U.esc(c.sunat.hash) : 'pendiente'}</div>
        <div class="c small">Estado: ${c.sunat ? U.esc(c.sunat.estado) : 'PENDIENTE'}</div>
        <div class="hr"></div>
        <div class="c small">Representación impresa SIMULADA de la ${U.esc(tipoNombre)}.</div>` : `
        <div class="c small">Documento interno. Canjear por boleta o factura.</div>`}
      <div class="sim" style="margin-top:6px">SIMULACIÓN · SIN VALOR TRIBUTARIO<br>NO VÁLIDO COMO COMPROBANTE DE PAGO</div>
      <div class="c">${U.esc(e.mensaje)}</div>
      ${e.web ? `<div class="c">${U.esc(e.web)}</div>` : ''}
      <div class="corte">- - - - - - - - ✂ - - - - - - - -</div>
    </div>`;
  },

  /** Comanda / orden de despacho para producción */
  comanda(p, d, estacionId = null) {
    const items = p.items.filter(i => i.estacion && (!estacionId || i.estacion === estacionId));
    const canal = d.canales.find(x => x.id === p.canal);
    const est = estacionId ? d.estaciones.find(s => s.id === estacionId) : null;
    return `
    <div class="${this.clase(d)}">
      ${this.bannerSim('SIMULACIÓN')}
      <div class="c b" style="font-size:1.15em">${d.textos.comanda}</div>
      ${est ? `<div class="c b">${U.esc(est.nombre.toUpperCase())}</div>` : ''}
      <div class="hr2"></div>
      <div class="c">PEDIDO</div>
      <div class="c xxl">#${U.pad(p.numero, 3)}</div>
      <div class="c b" style="font-size:1.2em">${canal ? U.esc(canal.nombre.toUpperCase()) : ''}${p.mesa ? ' · MESA ' + U.esc(p.mesa) : ''}</div>
      ${p.cliente && p.cliente.nombre && p.cliente.nombre !== 'CLIENTES VARIOS' ? `<div class="c">Cliente: ${U.esc(p.cliente.nombre)}</div>` : ''}
      <div class="hr"></div>
      <div class="kv"><span>${U.fecha(p.tiempos.creado)}</span><span>${U.hora(p.tiempos.creado)}</span></div>
      <div class="kv"><span>Atendido por:</span><span>${U.esc(p.cajero || 'Cajero 1')}</span></div>
      <div class="hr"></div>
      ${items.map(i => `
        <div class="item-k">${i.cantidad} x ${U.esc(i.nombre)}</div>
        ${i.opciones && Object.keys(i.opciones).length ? `<div class="nota-k">${Object.entries(i.opciones).map(([k, v]) => `${U.esc(k)}: ${U.esc(v)}`).join(' · ')}</div>` : ''}
        ${i.nota ? `<div class="nota-k">» ${U.esc(i.nota)}</div>` : ''}`).join('') || '<div class="c">(sin ítems para esta estación)</div>'}
      ${p.nota ? `<div class="hr"></div><div class="b">NOTA: ${U.esc(p.nota)}</div>` : ''}
      <div class="hr"></div>
      <div class="c">${p.comprobanteId ? 'PAGADO' : 'POR COBRAR'}</div>
      <div class="corte">- - - - - - - - ✂ - - - - - - - -</div>
    </div>`;
  },

  /** Ticket de recojo para el cliente (número de pedido) */
  turno(p, d) {
    return `
    <div class="${this.clase(d)}">
      ${this.bannerSim('SIMULACIÓN')}
      <div class="c b">${U.esc(d.empresa.nombreComercial)}</div>
      <div class="hr"></div>
      <div class="c">SU NÚMERO DE PEDIDO ES</div>
      <div class="c xxl" style="font-size:3.4em">${U.pad(p.numero, 3)}</div>
      <div class="c">Esté atento a la pantalla del mostrador</div>
      <div class="c small">${U.fecha(p.tiempos.creado)} ${U.hora(p.tiempos.creado)}</div>
      <div class="corte">- - - - - - - - ✂ - - - - - - - -</div>
    </div>`;
  },

  /** Reporte X (parcial) o Z (cierre) */
  reporte(r, d) {
    const filas = (obj, fmt) => Object.entries(obj).map(([k, v]) => `<div class="kv"><span>${U.esc(fmt(k))}</span><span>${v.n} · S/ ${U.f2(v.total)}</span></div>`).join('') || '<div class="c">—</div>';
    return `
    <div class="${this.clase(d)}">
      ${this.bannerSim('REPORTE DE SIMULACIÓN')}
      ${this.cabeceraEmpresa(d.empresa)}
      <div class="hr2"></div>
      <div class="c xl">${r.tipo === 'Z' ? 'REPORTE Z · CIERRE DE CAJA' : 'REPORTE X · PARCIAL'}</div>
      <div class="hr"></div>
      <div class="kv"><span>Cajero:</span><span>${U.esc(r.cajero)}</span></div>
      <div class="kv"><span>Apertura:</span><span>${U.fecha(r.desde)} ${U.hora(r.desde, false)}</span></div>
      <div class="kv"><span>${r.tipo === 'Z' ? 'Cierre' : 'Corte'}:</span><span>${U.fecha(r.hasta)} ${U.hora(r.hasta, false)}</span></div>
      <div class="hr"></div>
      <div class="b">VENTAS POR COMPROBANTE</div>
      ${filas(r.porTipo, k => Facturador.TIPOS[k] || k)}
      <div class="hr"></div>
      <div class="b">VENTAS POR MEDIO DE PAGO</div>
      ${filas(r.porMetodo, k => (Facturador.METODOS[k] || { nombre: k }).nombre)}
      <div class="hr"></div>
      <div class="kv"><span>Notas de crédito:</span><span>${r.nc.n} · -S/ ${U.f2(r.nc.total)}</span></div>
      <div class="kv"><span>Comprobantes anulados:</span><span>${r.anulados}</span></div>
      <div class="kv"><span>Op. gravada:</span><span>S/ ${U.f2(r.gravada)}</span></div>
      <div class="kv"><span>IGV:</span><span>S/ ${U.f2(r.igv)}</span></div>
      <div class="kv"><span>ICBPER:</span><span>S/ ${U.f2(r.icbper)}</span></div>
      <div class="kv tot"><span>VENTA NETA:</span><span>S/ ${U.f2(r.neto)}</span></div>
      <div class="hr"></div>
      <div class="b">ARQUEO DE EFECTIVO</div>
      <div class="kv"><span>Fondo inicial:</span><span>S/ ${U.f2(r.fondo)}</span></div>
      <div class="kv"><span>(+) Ventas en efectivo:</span><span>S/ ${U.f2(r.efectivo)}</span></div>
      <div class="kv"><span>(-) Devoluciones efectivo:</span><span>S/ ${U.f2(r.devEfectivo)}</span></div>
      <div class="kv b"><span>Efectivo esperado:</span><span>S/ ${U.f2(r.esperado)}</span></div>
      ${r.contado != null ? `
        <div class="kv"><span>Efectivo contado:</span><span>S/ ${U.f2(r.contado)}</span></div>
        <div class="kv b"><span>Diferencia:</span><span>S/ ${U.f2(r.contado - r.esperado)}</span></div>` : ''}
      <div class="hr"></div>
      <div class="c small">Impreso: ${U.fecha(new Date())} ${U.hora(new Date())}</div>
      <div class="sim" style="margin-top:6px">SIMULACIÓN · SIN VALOR TRIBUTARIO</div>
      <div class="corte">- - - - - - - - ✂ - - - - - - - -</div>
    </div>`;
  },

  /* ---------- QR ---------- */
  renderQRs(root) {
    U.qsa('.qr[data-qr]', root).forEach(el => {
      if (el.dataset.done) return;
      el.dataset.done = '1';
      const texto = el.dataset.qr;
      let canvas = null;
      if (window.QRCode) {
        const tmp = document.createElement('div');
        try {
          new QRCode(tmp, { text: texto, width: 160, height: 160, correctLevel: QRCode.CorrectLevel.M });
          canvas = tmp.querySelector('canvas');
        } catch (e) { canvas = null; }
      }
      if (!canvas) canvas = this.qrFalso(texto);
      const img = new Image();
      img.alt = 'QR'; img.src = canvas.toDataURL('image/png');
      el.appendChild(img);
    });
  },
  /** Respaldo sin internet: patrón tipo QR (no escaneable) */
  qrFalso(texto) {
    const n = 29, s = 6, cv = document.createElement('canvas');
    cv.width = cv.height = n * s;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    let seed = 0;
    for (let i = 0; i < texto.length; i++) seed = (seed * 31 + texto.charCodeAt(i)) >>> 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    g.fillStyle = '#000';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (rnd() > 0.5) g.fillRect(x * s, y * s, s, s);
    const finder = (x, y) => {
      g.fillStyle = '#fff'; g.fillRect((x - 1) * s, (y - 1) * s, 9 * s, 9 * s);
      g.fillStyle = '#000'; g.fillRect(x * s, y * s, 7 * s, 7 * s);
      g.fillStyle = '#fff'; g.fillRect((x + 1) * s, (y + 1) * s, 5 * s, 5 * s);
      g.fillStyle = '#000'; g.fillRect((x + 2) * s, (y + 2) * s, 3 * s, 3 * s);
    };
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
    return cv;
  },

  /* ---------- Impresión ---------- */
  /** Envía los tickets a la impresora real del navegador (o PDF) */
  imprimirNavegador(html) {
    let root = document.getElementById('print-root');
    if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
    root.innerHTML = html;
    this.renderQRs(root);
    setTimeout(() => { window.print(); }, 150);
  },

  /**
   * Muestra la impresora térmica simulada con animación de salida del papel.
   * tickets: array de strings HTML (se imprimen uno tras otro con corte).
   */
  imprimir(tickets, { titulo = 'Imprimiendo…', d = Store.get() } = {}) {
    if (!Array.isArray(tickets)) tickets = [tickets];
    const html = tickets.join('');
    const w58 = Number(d.config.anchoTicket) === 58;
    const back = document.createElement('div');
    back.className = 'printer-back';
    back.innerHTML = `
      <div class="printer-status"><span>🖨️</span><span data-st>${U.esc(titulo)}</span></div>
      <div class="printer busy ${w58 ? 'w58' : ''}"><span class="led"></span><span class="lbl">THERMAL · SIM-80</span><span class="slot"></span></div>
      <div class="paper-wrap"><div class="paper">${html}<div class="zigzag"></div></div></div>
      <div class="printer-actions">
        <button class="btn primary" data-print>🖨️ Imprimir en impresora real / PDF</button>
        <button class="btn" data-close>Cerrar (Esc)</button>
      </div>`;
    document.body.appendChild(back);
    this.renderQRs(back);
    const paper = back.querySelector('.paper');
    const dur = Math.min(4.5, 1.2 + tickets.length * 1.1);
    paper.style.setProperty('--dur', dur + 's');
    requestAnimationFrame(() => paper.classList.add('go'));
    if (d.config.sonido) U.printSound(dur * 1000);
    setTimeout(() => {
      back.querySelector('.printer').classList.remove('busy');
      back.querySelector('[data-st]').textContent = 'Impresión completada (simulada) · corte el ticket';
    }, dur * 1000);
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.querySelector('[data-close]').onclick = close;
    back.querySelector('[data-print]').onclick = () => this.imprimirNavegador(html);
    back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    return close;
  },
};
