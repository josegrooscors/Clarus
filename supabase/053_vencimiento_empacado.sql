-- 20-nov-2026 · Aplicado en el servidor (migración vencimiento_empacado, 12:28 p. m.) y validado con Demo, Yerenis y José en bloque que se deshace.
-- Vencimiento solo del empacado (rebanado 'r', rallado 'l'). '' = vencimiento por producto (interruptor del producto, apagado).
alter table public.vencimientos add column if not exists presentacion text not null default '';
alter table public.vencimientos drop constraint if exists vencimientos_presentacion_check;
alter table public.vencimientos add constraint vencimientos_presentacion_check check (presentacion in ('', 'r', 'l'));
alter table public.vencimientos drop constraint if exists vencimientos_visita_id_producto_id_key;
alter table public.vencimientos add constraint vencimientos_visita_producto_pres_key unique (visita_id, producto_id, presentacion);
drop index if exists public.vencimientos_cliente_producto;
create index vencimientos_cliente_producto on public.vencimientos (cliente_id, producto_id, presentacion, creado_at desc);
create or replace view public.v_ultimo_vencimiento with (security_invoker = true) as
select cliente_id, producto_id, vence, unidades, confirmada, visita_id, creado_at, fecha_visita, presentacion from (
  select distinct on (cliente_id, producto_id) cliente_id, producto_id, vence, unidades, confirmada, visita_id, creado_at,
         (creado_at at time zone 'America/Panama')::date as fecha_visita, presentacion
    from public.vencimientos v where presentacion = '' and vence is not null
   order by cliente_id, producto_id, creado_at desc) a
union all
select cliente_id, producto_id, vence, unidades, confirmada, visita_id, creado_at, fecha_visita, presentacion from (
  select distinct on (cliente_id, producto_id, presentacion) cliente_id, producto_id, vence, unidades, confirmada, visita_id, creado_at,
         (creado_at at time zone 'America/Panama')::date as fecha_visita, presentacion
    from public.vencimientos v where presentacion <> ''
   order by cliente_id, producto_id, presentacion, creado_at desc) b
where vence is not null;
update public.productos set controla_vencimiento = false where controla_vencimiento;
