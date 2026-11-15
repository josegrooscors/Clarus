-- Clarus v0.4.0 · Permisos por rol (configurables por empresa)
-- El administrador siempre puede todo. Los demás roles, según la tabla permisos_rol.
-- Permisos: tiendas (crear/editar tiendas), ubicacion (guardar GPS de una tienda sin ubicación),
--           rutas (asignar tiendas y días a vendedoras), productos (crear/editar productos),
--           usuarios (crear/editar usuarios que no sean administradores)

create table if not exists permisos_rol (
  empresa_id uuid not null default private.mi_empresa() references empresas(id) on delete cascade,
  rol        text not null check (rol in ('supervisor','operaciones','vendedor')),
  permiso    text not null check (permiso in ('tiendas','ubicacion','rutas','productos','usuarios')),
  permitido  boolean not null default false,
  primary key (empresa_id, rol, permiso)
);
alter table permisos_rol enable row level security;

create or replace function private.puede(p text) returns boolean
language sql stable security definer set search_path = public, private as $$
  select coalesce(mi_rol() = 'admin', false)
      or exists (select 1 from permisos_rol r where r.empresa_id = mi_empresa()
                 and r.rol = mi_rol() and r.permiso = p and r.permitido);
$$;

create policy perm_ver on permisos_rol for select using (empresa_id = private.mi_empresa());
create policy perm_admin on permisos_rol for all
  using (empresa_id = private.mi_empresa() and private.es_admin())
  with check (empresa_id = private.mi_empresa() and private.es_admin());

-- Tiendas: crear y editar con permiso "tiendas" (no se borran: se desactivan)
drop policy if exists cli_admin on clientes;
create policy cli_crear on clientes for insert with check (empresa_id = private.mi_empresa() and private.puede('tiendas'));
create policy cli_editar on clientes for update using (empresa_id = private.mi_empresa() and private.puede('tiendas'))
  with check (empresa_id = private.mi_empresa() and private.puede('tiendas'));

-- Productos
drop policy if exists prod_admin on productos;
create policy prod_crear on productos for insert with check (empresa_id = private.mi_empresa() and private.puede('productos'));
create policy prod_editar on productos for update using (empresa_id = private.mi_empresa() and private.puede('productos'))
  with check (empresa_id = private.mi_empresa() and private.puede('productos'));

-- Rutas (tienda → vendedora → días)
drop policy if exists at_admin on asignacion_tiendas;
create policy at_editar on asignacion_tiendas for all
  using (empresa_id = private.mi_empresa() and private.puede('rutas'))
  with check (empresa_id = private.mi_empresa() and private.puede('rutas'));

-- Guardar la ubicación de una tienda desde la visita (solo si no tiene, salvo permiso "tiendas")
create or replace function public.fijar_ubicacion_tienda(p_cliente bigint, p_lat double precision, p_lng double precision, p_precision integer default null)
returns void language plpgsql security definer set search_path = public, private as $$
declare c record;
begin
  select id, lat into c from clientes where id = p_cliente and empresa_id = private.mi_empresa();
  if c.id is null then raise exception 'Tienda no encontrada'; end if;
  if not private.puede('ubicacion') and not private.puede('tiendas') then
    raise exception 'No tienes permiso para guardar la ubicación de tiendas';
  end if;
  if c.lat is not null and not private.puede('tiendas') then
    raise exception 'Esta tienda ya tiene ubicación. Pide a tu supervisor que la corrija';
  end if;
  if coalesce(p_precision, 0) > 60 then
    raise exception 'La señal GPS no es precisa (% m). Sal a un lugar abierto e intenta de nuevo', p_precision;
  end if;
  update clientes set lat = p_lat, lng = p_lng where id = p_cliente;
end $$;
revoke all on function public.fijar_ubicacion_tienda(bigint, double precision, double precision, integer) from public, anon;
grant execute on function public.fijar_ubicacion_tienda(bigint, double precision, double precision, integer) to authenticated;

-- Permisos iniciales de cada empresa
insert into permisos_rol (empresa_id, rol, permiso, permitido)
select e.id, r.rol, p.permiso,
  (r.rol, p.permiso) in (('supervisor','tiendas'),('supervisor','ubicacion'),('supervisor','rutas'),
                         ('operaciones','productos'),('vendedor','ubicacion'))
from empresas e
cross join (values ('supervisor'),('operaciones'),('vendedor')) r(rol)
cross join (values ('tiendas'),('ubicacion'),('rutas'),('productos'),('usuarios')) p(permiso)
on conflict do nothing;
