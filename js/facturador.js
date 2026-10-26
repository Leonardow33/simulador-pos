/* ==========================================================
   Facturador — adaptador de emisión electrónica.

   HOY:   modo 'SIMULACION' → no se envía nada a SUNAT; se genera un
          hash ficticio y una respuesta "aceptada" simulada.
   LUEGO: implementar `Facturador.enviarReal(payload)` llamando a la
          API de SUNAT (SEE-Del contribuyente) o a un OSE/PSE, y
          cambiar `Facturador.modo = 'PRODUCCION'`. El resto del
          sistema (POS, caja, tickets) no necesita cambios.
   ========================================================== */
const Facturador = {
  modo: 'SIMULACION',

  TIPOS: {
    '01': 'FACTURA ELECTRÓNICA',
    '03': 'BOLETA DE VENTA ELECTRÓNICA',
    '07': 'NOTA DE CRÉDITO ELECTRÓNICA',
    'NV': 'NOTA DE VENTA',
  },
  /* Catálogo 06 SUNAT: tipo de documento de identidad */
  DOC_IDENTIDAD: {
    '0': 'SIN DOC.',
    '1': 'DNI',
    '4': 'C.E.',
    '6': 'RUC',
    '7': 'PASAPORTE',
  },
  /* Catálogo 09 SUNAT: motivos de nota de crédito (selección) */
  MOTIVOS_NC: {
    '01': 'Anulación de la operación',
    '02': 'Anulación por error en el RUC',
    '06': 'Devolución total',
    '07': 'Devolución por ítem',
    '09': 'Disminución en el valor',
  },
  METODOS: {
    efectivo: { nombre: 'Efectivo', icono: '💵' },
    yape: { nombre: 'Yape', icono: '📱' },
    plin: { nombre: 'Plin', icono: '📲' },
    tarjeta: { nombre: 'Tarjeta', icono: '💳' },
    transferencia: { nombre: 'Transferencia', icono: '🏦' },
  },

  serieDe(d, tipo, tipoRef) {
    if (tipo === '07') return d.series[tipoRef === '01' ? '07-01' : '07-03'];
    return d.series[tipo];
  },

  /**
   * Construye el comprobante (estructura interna) a partir de los datos de venta.
   * venta: { tipo, items, descuento, cliente, pago, pedido, cajero, referencia }
   */
  construir(d, venta) {
    const tasa = d.config.igv / 100;
    const serie = this.serieDe(d, venta.tipo, venta.referencia && venta.referencia.tipo);
    const numero = Store.siguienteCorrelativo(d, serie);
    const totales = U.calcularTotales(venta.items, venta.descuento, d.config);
    const items = venta.items.map(it => {
      const total = U.r2(it.precio * it.cantidad);
      const valor = U.r2(total / (1 + tasa));
      return {
        codigo: it.codigo,
        descripcion: it.nombre + (it.opciones && Object.keys(it.opciones).length ? ' (' + Object.values(it.opciones).join(', ') + ')' : ''),
        unidad: it.unidad || 'NIU',
        cantidad: it.cantidad,
        precioUnit: U.r2(it.precio),
        valorUnit: U.r2(it.precio / (1 + tasa)),
        valorVenta: valor,
        igv: U.r2(total - valor),
        total,
        icbper: it.icbper ? U.r2(it.cantidad * d.config.icbper) : 0,
      };
    });
    return {
      id: U.uid(),
      modo: this.modo,
      tipo: venta.tipo,
      serie,
      numero,
      fecha: new Date().toISOString(),
      moneda: 'PEN',
      cliente: venta.cliente,
      items,
      totales,
      leyenda: U.numeroALetras(totales.total),
      pago: venta.pago,
      cajero: venta.cajero || 'Cajero 1',
      pedidoId: venta.pedido ? venta.pedido.id : null,
      numeroPedido: venta.pedido ? venta.pedido.numero : null,
      canal: venta.pedido ? venta.pedido.canal : null,
      mesa: venta.pedido ? venta.pedido.mesa : null,
      referencia: venta.referencia || null,
      estado: 'EMITIDO',
      sunat: null,
    };
  },

  codigo(c) { return `${c.serie}-${U.pad(c.numero, 8)}`; },

  /** Texto del QR según formato de representación impresa SUNAT */
  textoQR(c, empresa) {
    return [empresa.ruc, c.tipo, c.serie, U.pad(c.numero, 8), U.f2(c.totales.igv), U.f2(c.totales.total),
      U.fechaISO(c.fecha), c.cliente.tipoDoc, c.cliente.numDoc || '-', c.sunat ? c.sunat.hash : ''].join('|') + '|';
  },

  /**
   * Payload en formato JSON genérico, inspirado en UBL 2.1 y en las APIs
   * de los PSE más usados en Perú. Ajustar al proveedor elegido.
   */
  payload(c, empresa) {
    return {
      operacion: 'generar_comprobante',
      modo: this.modo,
      emisor: { ruc: empresa.ruc, razon_social: empresa.razonSocial, nombre_comercial: empresa.nombreComercial, direccion: empresa.direccion },
      tipo_de_comprobante: c.tipo,
      serie: c.serie,
      numero: c.numero,
      fecha_de_emision: U.fechaISO(c.fecha),
      hora_de_emision: U.hora(c.fecha),
      moneda: c.moneda,
      tipo_de_operacion: '0101',
      cliente: {
        tipo_documento: c.cliente.tipoDoc,
        numero_documento: c.cliente.numDoc || '-',
        denominacion: c.cliente.nombre,
        direccion: c.cliente.direccion || '',
        email: c.cliente.email || '',
      },
      porcentaje_igv: Store.get().config.igv,
      total_descuento: c.totales.descuento,
      total_gravada: c.totales.gravada,
      total_igv: c.totales.igv,
      total_icbper: c.totales.icbper,
      total: c.totales.total,
      leyenda: c.leyenda,
      forma_de_pago: 'Contado',
      medio_de_pago: c.pago ? c.pago.metodo : null,
      documento_referencia: c.referencia ? {
        tipo: c.referencia.tipo, serie: c.referencia.serie, numero: c.referencia.numero,
        tipo_nota_credito: c.referencia.motivo, sustento: c.referencia.sustento,
      } : null,
      items: c.items.map(i => ({
        codigo: i.codigo,
        unidad_de_medida: i.unidad,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        valor_unitario: i.valorUnit,
        precio_unitario: i.precioUnit,
        subtotal: i.valorVenta,
        tipo_de_igv: '10', // Gravado - Operación onerosa (Catálogo 07)
        igv: i.igv,
        impuesto_bolsas: i.icbper,
        total: i.total,
      })),
    };
  },

  /**
   * Emite el comprobante. Llama a `onPaso(texto)` para mostrar el progreso.
   * Devuelve el objeto `sunat` con el resultado.
   */
  async emitir(c, empresa, onPaso = () => {}) {
    const payload = this.payload(c, empresa);
    if (this.modo !== 'SIMULACION') return this.enviarReal(payload, onPaso);

    if (c.tipo === 'NV') {
      onPaso('Registrando nota de venta interna');
      await U.sleep(400);
      return {
        estado: 'NO APLICA', codigo: '-', modo: 'SIMULACION',
        descripcion: 'Documento interno sin envío a SUNAT', hash: U.hash(JSON.stringify(payload)),
        enviadoEn: new Date().toISOString(),
      };
    }
    onPaso('Generando XML UBL 2.1 (simulado)');
    await U.sleep(450 + Math.random() * 300);
    onPaso('Firmando con certificado digital (simulado)');
    await U.sleep(450 + Math.random() * 300);
    onPaso('Enviando a SUNAT / OSE (simulado)');
    await U.sleep(600 + Math.random() * 500);
    onPaso('Recibiendo CDR (constancia de recepción)');
    await U.sleep(350);
    const nombre = this.TIPOS[c.tipo].replace(' ELECTRÓNICA', '').toLowerCase();
    return {
      estado: 'ACEPTADO (SIMULADO)',
      codigo: '0',
      modo: 'SIMULACION',
      descripcion: `La ${nombre} número ${this.codigo(c)} ha sido aceptada — SIMULACIÓN, sin validez tributaria`,
      hash: U.hash(JSON.stringify(payload)),
      xml: `${empresa.ruc}-${c.tipo}-${this.codigo(c)}.xml`,
      enviadoEn: new Date().toISOString(),
    };
  },

  /* Punto de integración futuro con SUNAT / OSE / PSE */
  async enviarReal(payload, onPaso) {
    throw new Error('Integración con SUNAT pendiente. Implementar Facturador.enviarReal().');
  },
};
