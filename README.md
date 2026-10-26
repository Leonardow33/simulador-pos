# Simulador POS · Pedidos y comprobantes electrónicos

Demo web de un sistema de punto de venta para negocios en Perú: toma de pedidos, pantalla de cocina/almacén, pantalla de mostrador, caja y emisión de **boletas y facturas en modo simulación** (cada ticket dice *“TICKET DE SIMULACIÓN · SIN VALOR TRIBUTARIO”*). La arquitectura queda lista para conectar la API de SUNAT (o un OSE/PSE).

Incluye dos empresas de ejemplo que se cambian desde cualquier pantalla:

| Empresa | Rubro | Particularidades |
|---|---|---|
| 🐟 **El Muelle · Cevichería** | Restaurante | Mesas, para llevar, delivery; cocina fría, caliente y bar; nivel de picante y notas |
| 👕 **Urbana Store** | Tienda de ropa | Tallas, colores, control de stock, bolsas con ICBPER, orden de despacho |

## Pantallas

| Pantalla | Archivo | Qué hace |
|---|---|---|
| Inicio | `index.html` | Elegir empresa, abrir pantallas, cargar pedidos de ejemplo |
| Pedidos y cobro (POS) | `pos.html` | Catálogo, variantes, descuentos, “enviar a cocina y cobrar después” o cobrar al momento; boleta / factura / nota de venta; efectivo con vuelto, Yape, Plin, tarjeta, transferencia |
| Cocina / Almacén | `cocina.html` | Pedidos en tiempo real por estación, cronómetro con alertas, marcar ítems o pedidos listos, reimprimir comanda |
| Mostrador | `mostrador.html` | **Vista cliente** (números en preparación / listos, anuncio con voz) y **vista personal** (entregar pedidos, ir a cobrar) |
| Caja y comprobantes | `caja.html` | Apertura y cierre, arqueo, reportes X y Z, reimpresión, anulación con **nota de crédito**, JSON por comprobante, exportación CSV y lote JSON |
| Configuración | `config.html` | Datos del emisor (RUC, razón social…), IGV, series, ancho de ticket 80/58 mm, productos y stock, respaldo |

Las pantallas se sincronizan al instante entre pestañas y ventanas **del mismo navegador** (por ejemplo, un monitor para el POS, otro para cocina y otro para el mostrador).

## Impresión de tickets

Al emitir, aparece una **impresora térmica simulada** que imprime el comprobante, la comanda y el ticket con el número de pedido. El botón *“Imprimir en impresora real / PDF”* envía el ticket a la impresora del sistema (térmica de 80 mm o PDF).

El ticket incluye lo que exige la representación impresa: datos del emisor, serie y correlativo, cliente, detalle, operación gravada, IGV, ICBPER, importe en letras, forma de pago, código QR con el formato SUNAT y hash; además, la leyenda de simulación y una marca de agua.

## Reglas implementadas

- Precios con IGV incluido; desglose de la operación gravada y del IGV (tasa configurable).
- Validación de RUC (dígito verificador) y DNI; la factura exige RUC, razón social y dirección.
- Boleta desde S/ 700 (configurable): exige identificar al cliente.
- Correlativos por serie (B001, F001, BC01, FC01, NV01…).
- La anulación de una boleta o factura emite una nota de crédito (catálogo 09) que la referencia; opcionalmente devuelve el stock.
- ICBPER por bolsa plástica.

## Cómo usarlo

No requiere instalación: es HTML, CSS y JavaScript puro.

```bash
# opción 1: abrir index.html directamente en el navegador
# opción 2: servidor local
python -m http.server 8080   # y abrir http://localhost:8080
```

Para una demostración rápida: **Inicio → “Cargar pedidos de ejemplo” → “Abrir las 3 pantallas principales”**.

RUC de prueba válido para facturas: `20555666773`.

## Integración futura con SUNAT

Todo el envío pasa por `js/facturador.js`:

- `Facturador.payload(comprobante, empresa)` arma un JSON con la estructura de los PSE más usados en Perú (inspirado en UBL 2.1).
- `Facturador.emitir()` hoy simula la firma, el envío y el CDR.
- Para producción, se implementa `Facturador.enviarReal(payload)` (SUNAT SEE, OSE o PSE) y se cambia `Facturador.modo = 'PRODUCCION'`. El POS, la caja y los tickets no cambian.

Para usarlo en **varios dispositivos** (tablet en cocina, TV en el mostrador), se reemplaza `js/store.js` (hoy usa `localStorage`) por un backend en tiempo real (Supabase, Firebase o una API propia con WebSockets) manteniendo la misma interfaz `get / update / subscribe`.

## Estructura

```
index.html  pos.html  cocina.html  mostrador.html  caja.html  config.html
css/app.css        estilos (tema glass)
css/ticket.css     ticket térmico e impresora simulada
js/datos-demo.js   empresas y catálogos de ejemplo
js/store.js        estado compartido y sincronización entre pantallas
js/facturador.js   adaptador de facturación electrónica (simulado)
js/ticket.js       plantillas de comprobante, comanda, turno y reportes X/Z
js/utils.js        formato, validaciones, número a letras, UI común
js/demo.js         generador de pedidos de ejemplo
js/pos.js, cocina.js, mostrador.js, caja.js, config.js
```

> ⚠️ Los RUC, DNI y clientes son ficticios. Los comprobantes generados **no tienen validez tributaria**.
