-- =====================================================================
-- CLARUS · Migración 001 · Base multiempresa
-- =====================================================================

-- ---------- EMPRESAS (cada cliente de Clarus) ----------
create table empresas (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  logo_url      text,
  color_primario text default '#4A7BD0',
  zona_horaria  text not null default 'America/Panama',
  activo        boolean not null default true,
  creado_at     timestamptz not null default now()
);

-- ---------- PERFILES (usuarios) ----------
create table perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  empresa_id  uuid not null references empresas(id),
  nombre      text not null,
  telefono    text,
  rol         text not null default 'vendedor'
              check (rol in ('admin','supervisor','operaciones','vendedor')),
  activo      boolean not null default true,
  creado_at   timestamptz not null default now()
);
create index on perfiles(empresa_id);

-- Funciones auxiliares de seguridad
create or replace function mi_empresa() returns uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from perfiles where id = auth.uid() and activo;
$$;

create or replace function mi_rol() returns text
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid() and activo;
$$;

create or replace function es_gestor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol() in ('admin','supervisor','operaciones'), false);
$$;

create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol() = 'admin', false);
$$;

-- ---------- CLIENTES (tiendas / puntos de venta) ----------
create table clientes (
  id          bigint generated always as identity primary key,
  empresa_id  uuid not null default mi_empresa() references empresas(id),
  codigo      text,
  nombre      text not null,
  cadena      text,
  direccion   text,
  zona        text,
  lat         double precision,
  lng         double precision,
  radio_m     integer not null default 100,
  activo      boolean not null default true,
  unique (empresa_id, codigo)
);
create index on clientes(empresa_id);

-- ---------- PRODUCTOS ----------
create table productos (
  id                 bigint generated always as identity primary key,
  empresa_id         uuid not null default mi_empresa() references empresas(id),
  sku                text,
  nombre             text not null,
  categoria          text,
  unidad_conteo      text not null default 'barra',   -- lo que cuenta el vendedor
  peso_kg_unidad     numeric(10,3) not null default 1, -- kg por unidad de conteo
  unidad_pedido      text not null default 'caja',     -- cómo se pide
  unidades_por_pedido numeric(10,2) not null default 1, -- barras por caja
  activo             boolean not null default true,
  unique (empresa_id, sku)
);
create index on productos(empresa_id);

-- ---------- ASIGNACIONES ----------
create table asignacion_tiendas (
  empresa_id   uuid not null default mi_empresa() references empresas(id),
  vendedor_id  uuid   references perfiles(id) on delete cascade,
  cliente_id   bigint references clientes(id) on delete cascade,
  dias_semana  int[]  not null default '{1,2,3,4,5,6}',  -- 1=lunes ... 7=domingo
  primary key (vendedor_id, cliente_id)
);

-- Productos por tienda + reglas de reposición (en unidades de conteo)
create table asignacion_productos (
  empresa_id    uuid not null default mi_empresa() references empresas(id),
  cliente_id    bigint references clientes(id) on delete cascade,
  producto_id   bigint references productos(id) on delete cascade,
  stock_minimo  numeric(10,2),   -- por debajo de esto se sugiere pedido
  stock_objetivo numeric(10,2),  -- a cuánto se quiere llevar el inventario
  primary key (cliente_id, producto_id)
);

-- ---------- VISITAS ----------
create table visitas (
  id              bigint generated always as identity primary key,
  empresa_id      uuid not null default mi_empresa() references empresas(id),
  vendedor_id     uuid   not null default auth.uid() references perfiles(id),
  cliente_id      bigint not null references clientes(id),
  checkin_at      timestamptz not null default now(),
  checkin_lat     double precision not null,
  checkin_lng     double precision not null,
  checkin_precision_m numeric,
  checkin_dist_m  numeric,
  checkin_dentro  boolean,
  checkout_at     timestamptz,
  checkout_lat    double precision,
  checkout_lng    double precision,
  checkout_precision_m numeric,
  checkout_dist_m numeric,
  checkout_dentro boolean,
  comentario      text,
  estado          text not null default 'abierta' check (estado in ('abierta','cerrada')),
  id_local        text unique   -- id generado en el teléfono (sincronización sin señal)
);
create index on visitas(empresa_id, checkin_at);
create index on visitas(vendedor_id, checkin_at);
create unique index una_visita_abierta on visitas(vendedor_id) where estado = 'abierta';

create or replace function distancia_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable set search_path = public as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

create or replace function calcular_geocerca() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select lat, lng, radio_m into c from clientes where id = new.cliente_id;
  if c.lat is not null then
    new.checkin_dist_m := round(distancia_m(new.checkin_lat, new.checkin_lng, c.lat, c.lng)::numeric, 1);
    new.checkin_dentro := new.checkin_dist_m <= c.radio_m;
    if new.checkout_lat is not null then
      new.checkout_dist_m := round(distancia_m(new.checkout_lat, new.checkout_lng, c.lat, c.lng)::numeric, 1);
      new.checkout_dentro := new.checkout_dist_m <= c.radio_m;
    end if;
  end if;
  if new.checkout_at is not null then new.estado := 'cerrada'; end if;
  return new;
end $$;
create trigger trg_geocerca before insert or update on visitas
for each row execute function calcular_geocerca();

-- Si la tienda no tiene coordenadas, la primera visita las fija
create or replace function fijar_coordenadas_tienda() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update clientes set lat = new.checkin_lat, lng = new.checkin_lng
   where id = new.cliente_id and lat is null
     and coalesce(new.checkin_precision_m, 999) <= 50;
  return new;
end $$;
create trigger trg_fijar_coord after insert on visitas
for each row execute function fijar_coordenadas_tienda();

-- ---------- CHECKLIST DE GESTIÓN ----------
create table tareas_catalogo (
  id          bigint generated always as identity primary key,
  empresa_id  uuid not null default mi_empresa() references empresas(id),
  nombre      text not null,
  orden       int not null default 0,
  activo      boolean not null default true,
  unique (empresa_id, nombre)
);

create table gestiones (
  empresa_id  uuid not null default mi_empresa() references empresas(id),
  visita_id   bigint references visitas(id) on delete cascade,
  tarea_id    bigint references tareas_catalogo(id),
  hecho       boolean not null default false,
  nota        text,
  primary key (visita_id, tarea_id)
);

-- ---------- FOTOS ----------
create table fotos (
  id            bigint generated always as identity primary key,
  empresa_id    uuid not null default mi_empresa() references empresas(id),
  visita_id     bigint not null references visitas(id) on delete cascade,
  tipo          text not null check (tipo in ('antes','despues','exhibicion','promocion','bodega','otro')),
  storage_path  text not null,
  tomada_at     timestamptz not null,
  lat           double precision,
  lng           double precision,
  subida_at     timestamptz not null default now()
);
create index on fotos(visita_id);

-- ---------- INVENTARIO ----------
create table inventarios (
  id              bigint generated always as identity primary key,
  empresa_id      uuid not null default mi_empresa() references empresas(id),
  visita_id       bigint not null references visitas(id) on delete cascade,
  producto_id     bigint not null references productos(id),
  ubicacion       text not null check (ubicacion in ('bodega','exhibicion')),
  unidades        numeric(10,2) not null check (unidades >= 0),
  peso_kg_unidad  numeric(10,3),
  kg              numeric(12,3) generated always as (unidades * peso_kg_unidad) stored,
  unique (visita_id, producto_id, ubicacion)
);

create or replace function copiar_peso() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.peso_kg_unidad is null then
    select peso_kg_unidad into new.peso_kg_unidad from productos where id = new.producto_id;
  end if;
  return new;
end $$;
create trigger trg_copiar_peso before insert on inventarios
for each row execute function copiar_peso();

-- ---------- PROMOCIONES ----------
create table promociones (
  id              bigint generated always as identity primary key,
  empresa_id      uuid not null default mi_empresa() references empresas(id),
  visita_id       bigint not null references visitas(id) on delete cascade,
  producto_id     bigint references productos(id),
  tipo            text check (tipo in ('oferta_precio','2x1','degustacion','material_pop','otra')),
  precio_regular  numeric(10,2),
  precio_oferta   numeric(10,2),
  vigencia_hasta  date,
  nota            text,
  foto_id         bigint references fotos(id)
);

-- =====================================================================
-- MÓDULO DE PEDIDOS
-- propuesto → aprobado / rechazado → orden_escaneada → impreso
-- =====================================================================
create table pedidos (
  id              bigint generated always as identity primary key,
  empresa_id      uuid not null default mi_empresa() references empresas(id),
  visita_id       bigint references visitas(id),
  cliente_id      bigint not null references clientes(id),
  vendedor_id     uuid not null default auth.uid() references perfiles(id),
  estado          text not null default 'propuesto'
                  check (estado in ('propuesto','aprobado','rechazado','orden_escaneada','impreso','anulado')),
  nota_vendedor   text,
  creado_at       timestamptz not null default now(),
  revisado_por    uuid references perfiles(id),
  revisado_at     timestamptz,
  nota_revision   text,
  numero_orden    text,          -- número de la orden física
  escaneado_at    timestamptz,
  impreso_por     uuid references perfiles(id),
  impreso_at      timestamptz
);
create index on pedidos(empresa_id, estado);
create index on pedidos(vendedor_id, creado_at);

create table pedido_items (
  id                bigint generated always as identity primary key,
  empresa_id        uuid not null default mi_empresa() references empresas(id),
  pedido_id         bigint not null references pedidos(id) on delete cascade,
  producto_id       bigint not null references productos(id),
  stock_unidades    numeric(10,2),  -- inventario contado (bodega + exhibición)
  sugerido          numeric(10,2),  -- cajas sugeridas por el sistema
  propuesto         numeric(10,2) not null check (propuesto >= 0), -- lo que propone el vendedor
  aprobado          numeric(10,2),  -- lo que aprueba el responsable
  unique (pedido_id, producto_id)
);

-- Orden de compra física escaneada (PDF de una o varias páginas)
create table pedido_documentos (
  id            bigint generated always as identity primary key,
  empresa_id    uuid not null default mi_empresa() references empresas(id),
  pedido_id     bigint not null references pedidos(id) on delete cascade,
  storage_path  text not null,     -- bucket 'documentos'
  paginas       int not null default 1,
  tomado_at     timestamptz not null default now(),
  lat           double precision,
  lng           double precision,
  subido_por    uuid not null default auth.uid() references perfiles(id)
);

-- Historial de estados (tiempos de aprobación, trazabilidad)
create table pedido_eventos (
  id          bigint generated always as identity primary key,
  empresa_id  uuid not null references empresas(id),
  pedido_id   bigint not null references pedidos(id) on delete cascade,
  estado      text not null,
  por         uuid references perfiles(id),
  at          timestamptz not null default now(),
  nota        text
);

create or replace function registrar_evento_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.estado is distinct from old.estado then
    if tg_op = 'UPDATE' then
      if new.estado in ('aprobado','rechazado') then
        new.revisado_por := auth.uid(); new.revisado_at := now();
      elsif new.estado = 'orden_escaneada' then
        new.escaneado_at := now();
      elsif new.estado = 'impreso' then
        new.impreso_por := auth.uid(); new.impreso_at := now();
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger trg_pedido_estado before insert or update on pedidos
for each row execute function registrar_evento_pedido();

create or replace function log_evento_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.estado is distinct from old.estado then
    insert into pedido_eventos (empresa_id, pedido_id, estado, por, nota)
    values (new.empresa_id, new.id, new.estado, auth.uid(),
            case when new.estado in ('aprobado','rechazado') then new.nota_revision end);
  end if;
  return new;
end $$;
create trigger trg_pedido_log after insert or update on pedidos
for each row execute function log_evento_pedido();

-- Reglas de flujo: el vendedor solo propone, escanea o anula su propuesta;
-- aprobar/rechazar es de supervisor/admin; imprimir es de operaciones/admin.
create or replace function validar_flujo_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text := mi_rol();
begin
  if new.estado is distinct from old.estado then
    if new.estado in ('aprobado','rechazado') and r not in ('admin','supervisor') then
      raise exception 'Solo un supervisor puede aprobar o rechazar pedidos';
    end if;
    if new.estado = 'impreso' and r not in ('admin','operaciones','supervisor') then
      raise exception 'Solo operaciones puede marcar un pedido como impreso';
    end if;
    if new.estado = 'orden_escaneada' and old.estado <> 'aprobado' then
      raise exception 'Solo se puede escanear la orden de un pedido aprobado';
    end if;
    if new.estado = 'aprobado' and old.estado <> 'propuesto' then
      raise exception 'Solo se aprueban pedidos propuestos';
    end if;
  end if;
  return new;
end $$;
create trigger trg_pedido_flujo before update on pedidos
for each row execute function validar_flujo_pedido();

-- Sugerencia de pedido para una visita (en cajas), según el inventario contado
create or replace function sugerir_pedido(p_visita bigint)
returns table (producto_id bigint, producto text, stock_unidades numeric,
               stock_minimo numeric, stock_objetivo numeric, sugerido numeric, unidad_pedido text)
language sql stable security invoker set search_path = public as $$
  with conteo as (
    select i.producto_id, sum(i.unidades) as stock
    from inventarios i where i.visita_id = p_visita group by i.producto_id
  )
  select ap.producto_id, p.nombre, coalesce(c.stock, 0),
         ap.stock_minimo, ap.stock_objetivo,
         greatest(0, ceil((coalesce(ap.stock_objetivo, ap.stock_minimo * 2) - coalesce(c.stock,0))
                          / nullif(p.unidades_por_pedido, 0))) as sugerido,
         p.unidad_pedido
  from visitas v
  join asignacion_productos ap on ap.cliente_id = v.cliente_id
  join productos p on p.id = ap.producto_id and p.activo
  left join conteo c on c.producto_id = ap.producto_id
  where v.id = p_visita
    and ap.stock_minimo is not null
    and coalesce(c.stock, 0) <= ap.stock_minimo
  order by p.nombre;
$$;

-- =====================================================================
-- VISTAS PARA DASHBOARD
-- =====================================================================
create view v_visitas with (security_invoker = true) as
select v.id, v.empresa_id, v.vendedor_id, p.nombre as vendedor, v.cliente_id,
       c.nombre as tienda, c.cadena,
       (v.checkin_at at time zone e.zona_horaria)::date as fecha,
       v.checkin_at, v.checkout_at,
       round(extract(epoch from (v.checkout_at - v.checkin_at)) / 60.0, 1) as minutos_en_tienda,
       v.checkin_dentro, v.checkout_dentro, v.checkin_dist_m, v.checkout_dist_m, v.estado,
       (select count(*) from fotos f where f.visita_id = v.id) as num_fotos,
       exists (select 1 from inventarios i where i.visita_id = v.id) as con_inventario
from visitas v
join perfiles p on p.id = v.vendedor_id
join clientes c on c.id = v.cliente_id
join empresas e on e.id = v.empresa_id;

create view v_jornada with (security_invoker = true) as
select empresa_id, vendedor_id, vendedor, fecha,
       min(checkin_at)  as inicio_jornada,
       max(checkout_at) as fin_jornada,
       round(extract(epoch from (max(checkout_at) - min(checkin_at))) / 3600.0, 2) as horas_jornada,
       round(sum(minutos_en_tienda) / 60.0, 2) as horas_en_tienda,
       count(*) as visitas,
       count(*) filter (where checkin_dentro and checkout_dentro) as visitas_validas
from v_visitas
group by empresa_id, vendedor_id, vendedor, fecha;

create view v_pedidos with (security_invoker = true) as
select pe.*, c.nombre as tienda, c.cadena, pv.nombre as vendedor,
       pr.nombre as revisado_por_nombre,
       (select count(*) from pedido_items it where it.pedido_id = pe.id) as num_items,
       (select coalesce(sum(coalesce(it.aprobado, it.propuesto)),0) from pedido_items it where it.pedido_id = pe.id) as total_cajas,
       (select storage_path from pedido_documentos d where d.pedido_id = pe.id order by d.tomado_at desc limit 1) as documento
from pedidos pe
join clientes c on c.id = pe.cliente_id
join perfiles pv on pv.id = pe.vendedor_id
left join perfiles pr on pr.id = pe.revisado_por;

-- =====================================================================
-- SEGURIDAD (RLS): todo filtrado por empresa
-- =====================================================================
alter table empresas             enable row level security;
alter table perfiles             enable row level security;
alter table clientes             enable row level security;
alter table productos            enable row level security;
alter table asignacion_tiendas   enable row level security;
alter table asignacion_productos enable row level security;
alter table visitas              enable row level security;
alter table tareas_catalogo      enable row level security;
alter table gestiones            enable row level security;
alter table fotos                enable row level security;
alter table inventarios          enable row level security;
alter table promociones          enable row level security;
alter table pedidos              enable row level security;
alter table pedido_items         enable row level security;
alter table pedido_documentos    enable row level security;
alter table pedido_eventos       enable row level security;

create policy emp_ver   on empresas for select to authenticated using (id = mi_empresa());
create policy emp_admin on empresas for update to authenticated using (id = mi_empresa() and es_admin());

create policy perf_ver   on perfiles for select to authenticated using (empresa_id = mi_empresa());
create policy perf_admin on perfiles for all to authenticated
  using (empresa_id = mi_empresa() and es_admin()) with check (empresa_id = mi_empresa() and es_admin());

-- Catálogos: todos los de la empresa leen; admin escribe
create policy cli_ver   on clientes for select to authenticated using (empresa_id = mi_empresa());
create policy cli_admin on clientes for all to authenticated
  using (empresa_id = mi_empresa() and es_admin()) with check (empresa_id = mi_empresa() and es_admin());
create policy prod_ver   on productos for select to authenticated using (empresa_id = mi_empresa());
create policy prod_admin on productos for all to authenticated
  using (empresa_id = mi_empresa() and es_admin()) with check (empresa_id = mi_empresa() and es_admin());
create policy tar_ver   on tareas_catalogo for select to authenticated using (empresa_id = mi_empresa());
create policy tar_admin on tareas_catalogo for all to authenticated
  using (empresa_id = mi_empresa() and es_admin()) with check (empresa_id = mi_empresa() and es_admin());
create policy ap_ver   on asignacion_productos for select to authenticated using (empresa_id = mi_empresa());
create policy ap_admin on asignacion_productos for all to authenticated
  using (empresa_id = mi_empresa() and es_admin()) with check (empresa_id = mi_empresa() and es_admin());
create policy at_ver   on asignacion_tiendas for select to authenticated
  using (empresa_id = mi_empresa() and (vendedor_id = auth.uid() or es_gestor()));
create policy at_admin on asignacion_tiendas for all to authenticated
  using (empresa_id = mi_empresa() and es_admin()) with check (empresa_id = mi_empresa() and es_admin());

-- Visitas: el vendedor maneja las suyas; gestores ven todas las de la empresa
create policy vis_ver on visitas for select to authenticated
  using (empresa_id = mi_empresa() and (vendedor_id = auth.uid() or es_gestor()));
create policy vis_crear on visitas for insert to authenticated
  with check (empresa_id = mi_empresa() and vendedor_id = auth.uid());
create policy vis_editar on visitas for update to authenticated
  using (empresa_id = mi_empresa() and (vendedor_id = auth.uid() or es_admin()));

-- Datos de la visita
create or replace function visita_mia(p_visita bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from visitas v where v.id = p_visita
                 and v.empresa_id = mi_empresa()
                 and (v.vendedor_id = auth.uid() or es_gestor()));
$$;

create policy ges_all on gestiones   for all to authenticated using (visita_mia(visita_id)) with check (visita_mia(visita_id));
create policy fot_all on fotos       for all to authenticated using (visita_mia(visita_id)) with check (visita_mia(visita_id));
create policy inv_all on inventarios for all to authenticated using (visita_mia(visita_id)) with check (visita_mia(visita_id));
create policy pro_all on promociones for all to authenticated using (visita_mia(visita_id)) with check (visita_mia(visita_id));

-- Pedidos
create policy ped_ver on pedidos for select to authenticated
  using (empresa_id = mi_empresa() and (vendedor_id = auth.uid() or es_gestor()));
create policy ped_crear on pedidos for insert to authenticated
  with check (empresa_id = mi_empresa() and vendedor_id = auth.uid() and estado = 'propuesto');
create policy ped_editar on pedidos for update to authenticated
  using (empresa_id = mi_empresa() and (vendedor_id = auth.uid() or es_gestor()));

create or replace function pedido_mio(p_pedido bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pedidos p where p.id = p_pedido
                 and p.empresa_id = mi_empresa()
                 and (p.vendedor_id = auth.uid() or es_gestor()));
$$;
create policy pit_all on pedido_items      for all to authenticated using (pedido_mio(pedido_id)) with check (pedido_mio(pedido_id));
create policy pdo_all on pedido_documentos for all to authenticated using (pedido_mio(pedido_id)) with check (pedido_mio(pedido_id));
create policy pev_ver on pedido_eventos    for select to authenticated using (pedido_mio(pedido_id));

-- =====================================================================
-- ALMACENAMIENTO: carpetas por empresa / usuario
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 2097152, array['image/jpeg','image/webp']),
       ('documentos', 'documentos', false, 10485760, array['application/pdf','image/jpeg'])
on conflict (id) do nothing;

create policy sto_subir on storage.objects for insert to authenticated
  with check (bucket_id in ('fotos','documentos')
              and (storage.foldername(name))[1] = mi_empresa()::text
              and (storage.foldername(name))[2] = auth.uid()::text);
create policy sto_ver on storage.objects for select to authenticated
  using (bucket_id in ('fotos','documentos')
         and (storage.foldername(name))[1] = mi_empresa()::text
         and ((storage.foldername(name))[2] = auth.uid()::text or es_gestor()));
