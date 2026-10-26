/* ==========================================================
   Generador de pedidos y ventas de ejemplo (para demos)
   ========================================================== */
function generarDemo() {
  Store.update(d => {
    if (!d.caja.abierta) { d.caja.abierta = true; d.caja.sesion = { id: U.uid(), cajero: 'Cajero 1', fondo: 200, desde: new Date(Date.now() - 3 * 3600e3).toISOString() }; }
    const prods = d.productos.filter(p => p.activo !== false && !p.sinPreparacion);
    const estados = ['entregado', 'entregado', 'entregado', 'listo', 'listo', 'preparacion', 'pendiente', 'pendiente'];
    const metodos = ['efectivo', 'yape', 'tarjeta', 'plin', 'efectivo'];
    estados.forEach((estado, k) => {
      const creado = new Date(Date.now() - (estados.length - k) * 7 * 60000);
      const items = Array.from({ length: 1 + (k % 3) }, (_, j) => {
        const p = prods[(k * 5 + j * 3) % prods.length];
        const op = {}; (p.opciones || []).forEach((o, i) => { op[o.nombre] = o.valores[(k + i) % o.valores.length]; });
        return { lid: U.uid(), productoId: p.id, codigo: p.codigo, nombre: p.nombre, emoji: p.emoji, precio: p.precio, cantidad: 1 + (j === 0 && k % 2), opciones: op, nota: k === 6 && j === 0 ? (d.rubro === 'restaurante' ? 'Sin cebolla, alérgico' : 'Envolver para regalo') : '', unidad: p.unidad || 'NIU', icbper: false, estacion: Store.estacionDe(d, p), listo: estado === 'listo' || estado === 'entregado', enviado: true };
      });
      if (estado === 'preparacion') items[0].listo = true;
      const canal = d.canales[k % d.canales.length];
      const p = {
        id: U.uid(), numero: Store.siguientePedido(d), canal: canal.id, mesa: canal.pideMesa ? d.mesas[k % d.mesas.length] : '',
        cliente: { nombre: canal.id === 'salon' || canal.id === 'tienda' ? '' : ['Lucía', 'Pedro', 'Carmen', 'Diego'][k % 4], telefono: '', direccion: canal.id === 'delivery' ? 'Av. Larco 345, Miraflores' : '' },
        nota: '', items, descuento: 0, estado,
        tiempos: { creado: creado.toISOString(), preparacion: estado !== 'pendiente' ? new Date(+creado + 60000).toISOString() : undefined, listo: ['listo', 'entregado'].includes(estado) ? new Date(+creado + 9 * 60000).toISOString() : undefined, entregado: estado === 'entregado' ? new Date(+creado + 12 * 60000).toISOString() : undefined },
        comprobanteId: null, cajero: 'Cajero 1',
      };
      if (k !== 7) {
        const met = metodos[k % metodos.length];
        const tot = U.calcularTotales(items, 0, d.config).total;
        const pago = met === 'efectivo' ? { metodo: met, recibido: Math.ceil(tot / 10) * 10, vuelto: U.r2(Math.ceil(tot / 10) * 10 - tot) } : { metodo: met, referencia: String(40000000 + k * 1234) };
        const fac = k === 2;
        const cliente = fac ? { tipoDoc: '6', numDoc: '20555666773', nombre: 'INVERSIONES ANDINAS DEL SUR S.A.C.', direccion: 'Av. Javier Prado Este 1234, San Isidro - Lima' } : { tipoDoc: '0', numDoc: '-', nombre: 'CLIENTES VARIOS', direccion: '' };
        const c = Facturador.construir(d, { tipo: fac ? '01' : '03', items, descuento: 0, cliente, pago, pedido: p, cajero: 'Cajero 1' });
        c.fecha = new Date(Math.max(+creado, +new Date(d.caja.sesion.desde))).toISOString();
        c.sunat = { estado: 'ACEPTADO (SIMULADO)', codigo: '0', modo: 'SIMULACION', descripcion: 'Aceptado (simulación)', hash: U.hash(JSON.stringify(c)), enviadoEn: c.fecha };
        d.comprobantes.unshift(c);
        p.comprobanteId = c.id; p.comprobante = Facturador.codigo(c);
      }
      d.pedidos.unshift(p);
    });
  });
  U.toast('Se generaron 8 pedidos de ejemplo en distintos estados', 'ok');
}
