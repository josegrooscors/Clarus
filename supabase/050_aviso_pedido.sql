-- 050 · Aviso al teléfono por cada pedido nuevo (José, 19-nov-2026)
-- Lo reciben gerencia y los roles con el permiso «aviso_pedido» (operaciones y administración; supervisión no).
-- En el menú, «Pedidos» muestra en un globo rojo cuántos pedidos faltan por procesar (estados propuesto / aprobado / orden_escaneada).
insert into public.permisos_rol (empresa_id, rol, permiso, permitido)
select e.id, r.rol, 'aviso_pedido', true from public.empresas e cross join (values ('operaciones'), ('administracion')) r(rol)
on conflict do nothing;

alter table public.pedidos add column if not exists avisado_at timestamptz;

-- Se dispara al guardarse los productos del pedido (así el aviso ya lleva las cajas). Una sola vez por pedido.
create or replace function public.aviso_pedido_nuevo() returns trigger language plpgsql security definer set search_path = public as $$
declare r record; tok text;
begin
  select valor into tok from public.app_secretos where clave = 'cron_token';
  for r in update public.pedidos p set avisado_at = now()
           where p.id in (select distinct pedido_id from nuevas) and p.avisado_at is null and coalesce(p.id_local, '') not like 'handy-%'
             and p.creado_at > now() - interval '1 hour' and p.estado <> 'anulado'
           returning p.id loop
    perform net.http_post(url := 'https://udkuzewzjiwzdizjkihz.supabase.co/functions/v1/pedido-aviso',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-clarus-token', tok), body := jsonb_build_object('pedido_nuevo', r.id));
  end loop;
  return null;
exception when others then return null; -- un fallo del aviso nunca debe impedir guardar el pedido
end $$;
drop trigger if exists trg_items_aviso on public.pedido_items;
create trigger trg_items_aviso after insert on public.pedido_items referencing new table as nuevas for each statement execute function public.aviso_pedido_nuevo();
