
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Modalidad de atención por cliente
alter table clientes add column if not exists modalidad text not null default 'pedido_tienda'
  check (modalidad in ('pedido_tienda','pedido_cliente','resurtido_auto'));
update clientes set modalidad='pedido_cliente' where cadena='Goly';
update clientes set modalidad='resurtido_auto' where cadena='Rey';

-- Secretos de servidor (sin políticas: solo el service role los lee)
create table if not exists app_secretos (clave text primary key, valor text not null);
alter table app_secretos enable row level security;
revoke all on app_secretos from anon, authenticated;


-- Comunicados
create table if not exists comunicados (
  id bigserial primary key,
  empresa_id uuid not null default private.mi_empresa() references empresas(id),
  autor_id uuid not null default auth.uid() references perfiles(id),
  titulo text not null, cuerpo text not null default '',
  requiere_ok boolean not null default true,
  recordar_min int not null default 60,
  programado_at timestamptz not null default now(),
  enviado_at timestamptz, anulado boolean not null default false,
  creado_at timestamptz not null default now());
create table if not exists comunicado_destinos (
  comunicado_id bigint references comunicados(id) on delete cascade,
  user_id uuid references perfiles(id) on delete cascade,
  leido_at timestamptz, ok_at timestamptz, recordado_at timestamptz, recordatorios int not null default 0,
  primary key (comunicado_id, user_id));
create index if not exists cd_user on comunicado_destinos(user_id) where ok_at is null;
create table if not exists push_suscripciones (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references perfiles(id) on delete cascade,
  p256dh text not null, auth text not null, agente text, creado_at timestamptz not null default now());


create or replace function private.es_destino(cid bigint) returns boolean language sql stable security definer set search_path = public, private as
$$ select exists (select 1 from comunicado_destinos where comunicado_id = cid and user_id = auth.uid()) $$;
create or replace function private.comunicado_mio(cid bigint) returns boolean language sql stable security definer set search_path = public, private as
$$ select exists (select 1 from comunicados where id = cid and empresa_id = private.mi_empresa()) $$;
revoke all on function private.es_destino(bigint), private.comunicado_mio(bigint) from public, anon;
grant execute on function private.es_destino(bigint), private.comunicado_mio(bigint) to authenticated;
alter table comunicados enable row level security;
alter table comunicado_destinos enable row level security;
alter table push_suscripciones enable row level security;

create policy com_sel on comunicados for select to authenticated using (
  empresa_id = private.mi_empresa() and (private.es_gestor() or (programado_at <= now() and not anulado and private.es_destino(id))));
create policy com_ins on comunicados for insert to authenticated with check (empresa_id = private.mi_empresa() and private.es_gestor());
create policy com_upd on comunicados for update to authenticated using (empresa_id = private.mi_empresa() and private.es_gestor()) with check (empresa_id = private.mi_empresa());
create policy com_del on comunicados for delete to authenticated using (empresa_id = private.mi_empresa() and private.es_gestor() and enviado_at is null);

create policy cd_sel on comunicado_destinos for select to authenticated using (
  user_id = auth.uid() or (private.es_gestor() and private.comunicado_mio(comunicado_id)));
create policy cd_ins on comunicado_destinos for insert to authenticated with check (
  private.es_gestor() and private.comunicado_mio(comunicado_id)
  and exists (select 1 from perfiles p where p.id = user_id and p.empresa_id = private.mi_empresa()));
create policy cd_upd on comunicado_destinos for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy ps_all on push_suscripciones for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on comunicados, comunicado_destinos, push_suscripciones to authenticated;
grant usage on sequence comunicados_id_seq to authenticated;
revoke update on comunicado_destinos from authenticated;
grant update (leido_at, ok_at) on comunicado_destinos to authenticated;

-- Vista para gestión: estado de lectura por comunicado
create or replace view v_comunicados with (security_invoker = on) as
select c.*, p.nombre autor,
  (select count(*) from comunicado_destinos d where d.comunicado_id = c.id) destinatarios,
  (select count(*) from comunicado_destinos d where d.comunicado_id = c.id and d.leido_at is not null) leidos,
  (select count(*) from comunicado_destinos d where d.comunicado_id = c.id and d.ok_at is not null) confirmados
from comunicados c join perfiles p on p.id = c.autor_id;
grant select on v_comunicados to authenticated;
