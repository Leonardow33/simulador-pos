-- ==========================================================
-- Simulador POS · esquema para Supabase
-- Ejecutar una sola vez en: Supabase → SQL Editor → New query → Run
-- ==========================================================

-- Cada fila es un registro de una empresa dentro de una sala de demo:
--   tipo = 'meta' (empresa, config, series, caja…), 'pedido', 'comprobante' o 'producto'
create table if not exists public.registros (
  sala        text        not null check (sala ~ '^[a-z0-9-]{3,40}$'),
  negocio     text        not null,
  tipo        text        not null check (tipo in ('meta', 'pedido', 'comprobante', 'producto')),
  id          text        not null,
  data        jsonb       not null,
  autor       text,
  updated_at  timestamptz not null default now(),
  primary key (sala, negocio, tipo, id)
);

create index if not exists registros_sala_negocio on public.registros (sala, negocio);

-- Necesario para que los DELETE lleguen por Realtime con todas las columnas
alter table public.registros replica identity full;

-- Seguridad (RLS). Para la DEMO se permite acceso con la clave pública:
-- quien conozca el link de una sala puede ver y modificar esa sala.
-- En producción esto se reemplaza por usuarios autenticados por empresa.
alter table public.registros enable row level security;

-- Los proyectos nuevos de Supabase no otorgan acceso automático a tablas nuevas
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.registros to anon, authenticated;

drop policy if exists "demo_select" on public.registros;
drop policy if exists "demo_insert" on public.registros;
drop policy if exists "demo_update" on public.registros;
drop policy if exists "demo_delete" on public.registros;
create policy "demo_select" on public.registros for select to anon, authenticated using (true);
create policy "demo_insert" on public.registros for insert to anon, authenticated with check (true);
create policy "demo_update" on public.registros for update to anon, authenticated using (true) with check (true);
create policy "demo_delete" on public.registros for delete to anon, authenticated using (true);

-- Activar Realtime para la tabla
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'registros'
  ) then
    alter publication supabase_realtime add table public.registros;
  end if;
end $$;
