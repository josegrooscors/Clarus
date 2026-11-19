-- 048 · Venta facturada y merma por tienda, producto y mes (19-nov-2026)
-- Fuente: Tablero Comercial Viejo Cántaro (facturas de Profit Plus y notas de crédito del estado de cuenta).
-- Merma = notas de crédito MERMA + DIFERENCIA PESO/ENTREGA, igual que en el Tablero Comercial.
-- producto_id NULL = nota de crédito sin detalle de producto (oct y nov 2026 vienen así en el estado de cuenta).
-- Se carga con supabase/tools/facturacion_desde_tablero.py + public.cargar_facturacion() (solo desde SQL de administración).

create table if not exists public.facturacion_mes (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  mes date not null,
  cliente_id bigint not null references public.clientes(id) on delete cascade,
  producto_id bigint references public.productos(id) on delete cascade,
  venta_kg numeric not null default 0,
  venta_usd numeric not null default 0,
  merma_usd numeric not null default 0,
  corte date,
  actualizado timestamptz not null default now()
);
create unique index if not exists facturacion_mes_uk on public.facturacion_mes (empresa_id, mes, cliente_id, coalesce(producto_id, 0));
create index if not exists facturacion_mes_cli on public.facturacion_mes (cliente_id, mes);
alter table public.facturacion_mes enable row level security;

-- Lo ve la gerencia y cada vendedora solo lo de sus tiendas (igual que los objetivos)
drop policy if exists fm_ver on public.facturacion_mes;
create policy fm_ver on public.facturacion_mes for select to authenticated using (
  empresa_id = (select private.mi_empresa()) and ((select private.es_gestor()) or exists (
    select 1 from public.asignacion_tiendas a where a.cliente_id = facturacion_mes.cliente_id and a.vendedor_id = (select auth.uid()))));
drop policy if exists fm_admin on public.facturacion_mes;
create policy fm_admin on public.facturacion_mes for all to authenticated
  using (empresa_id = (select private.mi_empresa()) and (select private.es_admin()))
  with check (empresa_id = (select private.mi_empresa()) and (select private.es_admin()));
grant select on public.facturacion_mes to authenticated;

-- Límite de merma sobre la venta (%, el mismo del Tablero Comercial: 3 %). Ámbar hasta 1.5 veces el límite; después rojo.
alter table public.empresas add column if not exists merma_limite numeric not null default 3;

-- Carga compacta: «AAMM:cliente,producto,kg,usd,merma;…/AAMM:…» (producto 0 = sin detalle). Devuelve filas y huella md5 del texto recibido.
create or replace function public.cargar_facturacion(p_empresa uuid, p_datos text, p_corte date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare seg text; r text; a text[]; m date; n int := 0;
begin
  foreach seg in array string_to_array(p_datos, '/') loop
    m := to_date('20' || left(seg, 4) || '01', 'YYYYMMDD');
    foreach r in array string_to_array(substr(seg, 6), ';') loop
      a := string_to_array(r, ',');
      insert into public.facturacion_mes (empresa_id, mes, cliente_id, producto_id, venta_kg, venta_usd, merma_usd, corte, actualizado)
      values (p_empresa, m, a[1]::bigint, nullif(a[2], '0')::bigint, coalesce(nullif(a[3], '')::numeric, 0), coalesce(nullif(a[4], '')::numeric, 0), coalesce(nullif(a[5], '')::numeric, 0), p_corte, now())
      on conflict (empresa_id, mes, cliente_id, coalesce(producto_id, 0)) do update
        set venta_kg = excluded.venta_kg, venta_usd = excluded.venta_usd, merma_usd = excluded.merma_usd, corte = excluded.corte, actualizado = now();
      n := n + 1;
    end loop;
  end loop;
  return jsonb_build_object('filas', n, 'md5', md5(p_datos));
end $$;
revoke all on function public.cargar_facturacion(uuid, text, date) from public, anon, authenticated;

-- Lectura compacta para la app (respeta los permisos de quien consulta; sin el tope de 1000 filas de la API)
create or replace function public.facturacion_desde(p_desde date)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'corte', (select max(corte) from public.facturacion_mes),
    'filas', coalesce((select jsonb_agg(jsonb_build_array(to_char(mes, 'YYYY-MM-DD'), cliente_id, coalesce(producto_id, 0), venta_kg, venta_usd, merma_usd) order by mes, cliente_id)
                       from public.facturacion_mes where mes >= p_desde), '[]'::jsonb));
$$;
revoke all on function public.facturacion_desde(date) from public, anon;
grant execute on function public.facturacion_desde(date) to authenticated;
