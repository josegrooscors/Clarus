-- 044 · Visitas justificadas (18-nov-2026, a pedido de José).
-- La vendedora (o la supervisora cuando hace ruta) puede justificar una tienda programada que no va a visitar:
-- reunión en oficina, tienda cerrada u otro motivo (con nota obligatoria). Estructura de las grandes plataformas:
-- "motivo de visita no realizada" con catálogo cerrado, visible para gerencia y fuera del cálculo de cumplimiento.
-- Una visita justificada NO cuenta como programada: no baja el cumplimiento de ruta ni marca «dejó visitas sin hacer».
-- Si al final sí visita la tienda, la visita real manda (la justificación queda sin efecto en los cálculos).
create table public.visitas_justificadas (
  id bigint generated always as identity primary key,
  empresa_id uuid not null default private.mi_empresa() references public.empresas(id) on delete cascade,
  vendedor_id uuid not null default auth.uid() references public.perfiles(id) on delete cascade,
  cliente_id bigint not null references public.clientes(id) on delete cascade,
  fecha date not null,
  motivo text not null check (motivo in ('reunion_oficina','tienda_cerrada','otro')),
  nota text,
  creado_at timestamptz not null default now(),
  creado_por uuid default auth.uid(),
  unique (vendedor_id, cliente_id, fecha),
  check (motivo <> 'otro' or length(btrim(coalesce(nota,''))) > 0)
);
create index visitas_justificadas_empresa_fecha on public.visitas_justificadas (empresa_id, fecha);
create index visitas_justificadas_cliente on public.visitas_justificadas (cliente_id);
alter table public.visitas_justificadas enable row level security;
create policy vj_ver on public.visitas_justificadas for select to authenticated
  using (empresa_id = (select private.mi_empresa()) and (vendedor_id = (select auth.uid()) or (select private.es_gestor())));
create policy vj_crear on public.visitas_justificadas for insert to authenticated
  with check (empresa_id = (select private.mi_empresa()) and (
    (vendedor_id = (select auth.uid()) and fecha between (now() at time zone 'America/Panama')::date - 3 and (now() at time zone 'America/Panama')::date + 7)
    or private.puede('rutas')));
create policy vj_editar on public.visitas_justificadas for update to authenticated
  using (empresa_id = (select private.mi_empresa()) and ((vendedor_id = (select auth.uid()) and fecha >= (now() at time zone 'America/Panama')::date - 3) or private.puede('rutas')))
  with check (empresa_id = (select private.mi_empresa()) and ((vendedor_id = (select auth.uid())) or private.puede('rutas')));
create policy vj_borrar on public.visitas_justificadas for delete to authenticated
  using (empresa_id = (select private.mi_empresa()) and ((vendedor_id = (select auth.uid()) and fecha >= (now() at time zone 'America/Panama')::date - 3) or private.puede('rutas')));
revoke all on public.visitas_justificadas from anon;
grant select, insert, update, delete on public.visitas_justificadas to authenticated;

-- Mi desempeño: las justificadas salen de las agendadas.
create or replace function public.mi_desempeno(p_vendedor uuid default null::uuid)
 returns json language sql stable set search_path to 'public'
as $function$
with prm as (
  select coalesce(p_vendedor, auth.uid()) as vid,
         (now() at time zone 'America/Panama')::date as hoy
), dias as (
  select d::date as d from prm, generate_series(date_trunc('month', prm.hoy)::date, prm.hoy - 1, interval '1 day') d
  where not exists (select 1 from dias_no_laborables x join perfiles p on p.empresa_id = x.empresa_id
                    where p.id = prm.vid and x.fecha = d::date)
), vis as (
  select v.cliente_id, (v.checkin_at at time zone 'America/Panama') as ini,
         (v.checkout_at at time zone 'America/Panama') as fin
  from visitas v, prm
  where v.vendedor_id = prm.vid
    and v.checkin_at >= (date_trunc('month', prm.hoy)::timestamp at time zone 'America/Panama')
    and v.checkin_at < (prm.hoy::timestamp at time zone 'America/Panama')
), agenda as (
  select dias.d, a.cliente_id
  from dias, prm join asignacion_tiendas a on a.vendedor_id = prm.vid
  where extract(isodow from dias.d)::int = any(a.dias_semana)
    and not (exists (select 1 from visitas_justificadas j where j.vendedor_id = prm.vid and j.cliente_id = a.cliente_id and j.fecha = dias.d)
             and not exists (select 1 from vis where vis.cliente_id = a.cliente_id and vis.ini::date = dias.d))
), por_dia as (
  select ini::date d, min(ini::time) primero, max(fin::time) ultimo from vis group by 1
)
select json_build_object(
  'agendadas', (select count(*) from agenda),
  'cumplidas', (select count(*) from agenda g where exists (select 1 from vis where vis.cliente_id = g.cliente_id and vis.ini::date = g.d)),
  'justificadas', (select count(*) from visitas_justificadas j, prm where j.vendedor_id = prm.vid and j.fecha >= date_trunc('month', prm.hoy)::date and j.fecha < prm.hoy),
  'dias_trabajados', (select count(*) from por_dia),
  'inicio_min', (select round(avg(extract(epoch from primero) / 60)) from por_dia),
  'cierre_min', (select round(avg(extract(epoch from ultimo) / 60)) from por_dia where ultimo is not null),
  'tienda_min', (select round(avg(extract(epoch from fin - ini) / 60)) from vis where fin is not null and fin > ini and fin - ini < interval '5 hours')
);
$function$;
