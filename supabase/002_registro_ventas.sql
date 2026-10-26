-- ==========================================================
-- 002 · Registro formal de ventas (comprobantes electrónicos)
-- Ejecutar una vez en Supabase → SQL Editor, DESPUÉS de schema.sql.
--
-- Cada vez que la app guarda un comprobante en `registros`, un trigger
-- lo copia (con columnas tributarias) a `comprobantes_electronicos`.
-- Esta tabla es la que usará la integración con SUNAT: estado del envío,
-- hash, enlaces a XML/CDR/PDF, reintentos y errores.
-- ==========================================================

create table if not exists public.comprobantes_electronicos (
  sala                 text        not null,
  id                   text        not null,          -- id interno del comprobante
  negocio              text        not null,
  modo                 text        not null default 'SIMULACION' check (modo in ('SIMULACION', 'PRODUCCION')),
  -- Emisor
  emisor_ruc           text,
  emisor_razon_social  text,
  -- Comprobante (Catálogo 01: 01 factura, 03 boleta, 07 nota de crédito; NV = nota de venta interna)
  tipo                 text        not null,
  serie                text        not null,
  numero               integer     not null,
  codigo               text        generated always as (serie || '-' || lpad(numero::text, 8, '0')) stored,
  fecha_emision        timestamptz not null,
  moneda               text        not null default 'PEN',
  -- Cliente (Catálogo 06: 0 sin doc, 1 DNI, 4 CE, 6 RUC, 7 pasaporte)
  cliente_tipo_doc     text,
  cliente_num_doc      text,
  cliente_nombre       text,
  cliente_direccion    text,
  -- Importes
  descuento            numeric(12,2) not null default 0,
  op_gravada           numeric(12,2) not null default 0,
  igv                  numeric(12,2) not null default 0,
  icbper               numeric(12,2) not null default 0,
  total                numeric(12,2) not null default 0,
  leyenda              text,
  medio_pago           text,
  -- Estado interno
  estado               text        not null default 'EMITIDO',   -- EMITIDO | ANULADO
  anulado_por          text,
  -- Documento de referencia (notas de crédito)
  ref_tipo             text,
  ref_serie            text,
  ref_numero           integer,
  ref_motivo           text,                                      -- Catálogo 09
  ref_sustento         text,
  -- Operación
  numero_pedido        integer,
  canal                text,
  mesa                 text,
  cajero               text,
  items                jsonb       not null default '[]'::jsonb,
  -- SUNAT / OSE / PSE
  sunat_estado         text        not null default 'PENDIENTE',  -- PENDIENTE | SIMULADO | NO_APLICA | ACEPTADO | OBSERVADO | RECHAZADO | ERROR
  sunat_codigo         text,
  sunat_descripcion    text,
  sunat_hash           text,
  sunat_enviado_en     timestamptz,
  xml_url              text,
  cdr_url              text,
  pdf_url              text,
  intentos             integer     not null default 0,
  ultimo_error         text,
  -- Copia completa del comprobante tal como lo generó la app
  data                 jsonb       not null,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),
  primary key (sala, id)
);

create index if not exists ce_sala_fecha   on public.comprobantes_electronicos (sala, fecha_emision desc);
create index if not exists ce_correlativo  on public.comprobantes_electronicos (emisor_ruc, tipo, serie, numero);
create index if not exists ce_sunat_estado on public.comprobantes_electronicos (modo, sunat_estado);

-- ---------- Trigger: registros → comprobantes_electronicos ----------
create or replace function public.registrar_comprobante()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d   jsonb;
  emp jsonb;
  est text;
begin
  if tg_op = 'DELETE' then
    -- Solo se borran ventas de simulación. Las reales nunca se eliminan.
    if old.tipo = 'comprobante' then
      delete from comprobantes_electronicos
      where sala = old.sala and id = old.id and modo = 'SIMULACION';
    end if;
    return old;
  end if;

  if new.tipo <> 'comprobante' then
    return new;
  end if;

  d := new.data;
  select r.data -> 'empresa' into emp
  from registros r
  where r.sala = new.sala and r.negocio = new.negocio and r.tipo = 'meta' and r.id = 'meta';

  est := case
    when d -> 'sunat' is null or jsonb_typeof(d -> 'sunat') = 'null' then 'PENDIENTE'
    when d -> 'sunat' ->> 'estado' like 'ACEPTADO (SIMULADO)%' then 'SIMULADO'
    when d -> 'sunat' ->> 'estado' = 'NO APLICA' then 'NO_APLICA'
    else upper(replace(coalesce(d -> 'sunat' ->> 'estado', 'PENDIENTE'), ' ', '_'))
  end;

  insert into comprobantes_electronicos as c (
    sala, id, negocio, modo, emisor_ruc, emisor_razon_social,
    tipo, serie, numero, fecha_emision, moneda,
    cliente_tipo_doc, cliente_num_doc, cliente_nombre, cliente_direccion,
    descuento, op_gravada, igv, icbper, total, leyenda, medio_pago,
    estado, anulado_por, ref_tipo, ref_serie, ref_numero, ref_motivo, ref_sustento,
    numero_pedido, canal, mesa, cajero, items,
    sunat_estado, sunat_codigo, sunat_descripcion, sunat_hash, sunat_enviado_en,
    data
  ) values (
    new.sala, new.id, new.negocio,
    coalesce(d ->> 'modo', d -> 'sunat' ->> 'modo', 'SIMULACION'),
    emp ->> 'ruc', emp ->> 'razonSocial',
    d ->> 'tipo', d ->> 'serie', (d ->> 'numero')::int, (d ->> 'fecha')::timestamptz, coalesce(d ->> 'moneda', 'PEN'),
    d -> 'cliente' ->> 'tipoDoc', d -> 'cliente' ->> 'numDoc', d -> 'cliente' ->> 'nombre', d -> 'cliente' ->> 'direccion',
    coalesce((d -> 'totales' ->> 'descuento')::numeric, 0), coalesce((d -> 'totales' ->> 'gravada')::numeric, 0),
    coalesce((d -> 'totales' ->> 'igv')::numeric, 0), coalesce((d -> 'totales' ->> 'icbper')::numeric, 0),
    coalesce((d -> 'totales' ->> 'total')::numeric, 0), d ->> 'leyenda', d -> 'pago' ->> 'metodo',
    coalesce(d ->> 'estado', 'EMITIDO'), d ->> 'anuladoPor',
    d -> 'referencia' ->> 'tipo', d -> 'referencia' ->> 'serie', (d -> 'referencia' ->> 'numero')::int,
    d -> 'referencia' ->> 'motivo', d -> 'referencia' ->> 'sustento',
    (d ->> 'numeroPedido')::int, d ->> 'canal', d ->> 'mesa', d ->> 'cajero', coalesce(d -> 'items', '[]'::jsonb),
    est, d -> 'sunat' ->> 'codigo', d -> 'sunat' ->> 'descripcion', d -> 'sunat' ->> 'hash',
    (d -> 'sunat' ->> 'enviadoEn')::timestamptz,
    d
  )
  on conflict (sala, id) do update set
    negocio = excluded.negocio, modo = excluded.modo,
    emisor_ruc = coalesce(excluded.emisor_ruc, c.emisor_ruc),
    emisor_razon_social = coalesce(excluded.emisor_razon_social, c.emisor_razon_social),
    tipo = excluded.tipo, serie = excluded.serie, numero = excluded.numero,
    fecha_emision = excluded.fecha_emision, moneda = excluded.moneda,
    cliente_tipo_doc = excluded.cliente_tipo_doc, cliente_num_doc = excluded.cliente_num_doc,
    cliente_nombre = excluded.cliente_nombre, cliente_direccion = excluded.cliente_direccion,
    descuento = excluded.descuento, op_gravada = excluded.op_gravada, igv = excluded.igv,
    icbper = excluded.icbper, total = excluded.total, leyenda = excluded.leyenda, medio_pago = excluded.medio_pago,
    estado = excluded.estado, anulado_por = excluded.anulado_por,
    ref_tipo = excluded.ref_tipo, ref_serie = excluded.ref_serie, ref_numero = excluded.ref_numero,
    ref_motivo = excluded.ref_motivo, ref_sustento = excluded.ref_sustento,
    numero_pedido = excluded.numero_pedido, canal = excluded.canal, mesa = excluded.mesa,
    cajero = excluded.cajero, items = excluded.items,
    sunat_estado = excluded.sunat_estado, sunat_codigo = excluded.sunat_codigo,
    sunat_descripcion = excluded.sunat_descripcion, sunat_hash = excluded.sunat_hash,
    sunat_enviado_en = excluded.sunat_enviado_en,
    data = excluded.data, actualizado_en = now();

  return new;
end;
$$;

drop trigger if exists trg_registrar_comprobante on public.registros;
create trigger trg_registrar_comprobante
after insert or update or delete on public.registros
for each row execute function public.registrar_comprobante();

-- ---------- Permisos: la app solo puede LEER esta tabla ----------
-- (la escribe el trigger; en producción también la Edge Function de SUNAT)
alter table public.comprobantes_electronicos enable row level security;
drop policy if exists "demo_select_ce" on public.comprobantes_electronicos;
create policy "demo_select_ce" on public.comprobantes_electronicos for select to anon, authenticated using (true);
grant select on public.comprobantes_electronicos to anon, authenticated;

-- ---------- Vistas de consulta ----------
-- Ventas por día (hora de Lima), descontando notas de crédito
create or replace view public.ventas_por_dia with (security_invoker = true) as
select sala, negocio, modo,
       (fecha_emision at time zone 'America/Lima')::date as fecha,
       tipo,
       count(*) as cantidad,
       sum(case when tipo = '07' then -total else total end)      as total,
       sum(case when tipo = '07' then -op_gravada else op_gravada end) as op_gravada,
       sum(case when tipo = '07' then -igv else igv end)          as igv
from public.comprobantes_electronicos
where not (tipo = 'NV' and estado = 'ANULADO')
group by 1, 2, 3, 4, 5;

-- Detalle de productos vendidos (un renglón por ítem)
create or replace view public.ventas_detalle with (security_invoker = true) as
select c.sala, c.negocio, c.modo, c.codigo, c.tipo, c.fecha_emision, c.estado,
       i ->> 'codigo'                 as codigo_producto,
       i ->> 'descripcion'            as descripcion,
       (i ->> 'cantidad')::numeric    as cantidad,
       (i ->> 'precioUnit')::numeric  as precio_unitario,
       (i ->> 'total')::numeric       as total
from public.comprobantes_electronicos c
cross join lateral jsonb_array_elements(c.items) as i;

-- Cola de envío a SUNAT (la usará la integración real)
create or replace view public.cola_envio_sunat with (security_invoker = true) as
select sala, id, codigo, tipo, fecha_emision, total, sunat_estado, intentos, ultimo_error
from public.comprobantes_electronicos
where modo = 'PRODUCCION' and tipo <> 'NV' and sunat_estado in ('PENDIENTE', 'ERROR')
order by fecha_emision;

-- Control: correlativos duplicados (no debería devolver filas)
create or replace view public.control_correlativos_duplicados with (security_invoker = true) as
select sala, emisor_ruc, tipo, serie, numero, count(*) as veces
from public.comprobantes_electronicos
group by 1, 2, 3, 4, 5
having count(*) > 1;

grant select on public.ventas_por_dia, public.ventas_detalle, public.cola_envio_sunat,
                 public.control_correlativos_duplicados to anon, authenticated;

-- ---------- Cargar las ventas que ya existen ----------
update public.registros set data = data where tipo = 'comprobante';
