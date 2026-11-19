-- 049 · «Tienda cerrada» exige foto de la tienda (regla de José, 19-nov-2026)
-- Sin foto, la tienda queda como no visitada. La foto guarda hora, ubicación y distancia a la tienda.
-- Pendiente: Clarus Vision valida que la foto es de esa tienda (cuando haya créditos de la API).
alter table public.visitas_justificadas
  add column if not exists foto_path text,
  add column if not exists foto_at timestamptz,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists dist_m integer,
  add column if not exists dentro boolean;

-- SE APLICA AL PUBLICAR LA VERSIÓN QUE PIDE LA FOTO (no antes: la versión anterior de la app guarda «tienda cerrada» sin foto).
-- La vendedora no puede justificarse a sí misma con «tienda cerrada» sin foto. Gerencia sí puede justificar por ella desde Programación.
create or replace function public.vj_exige_foto() returns trigger language plpgsql set search_path = public as $$
begin
  if new.motivo = 'tienda_cerrada' and new.foto_path is null and (select auth.uid()) = new.vendedor_id then
    raise exception 'Para marcar «Tienda cerrada» hay que tomar la foto de la tienda.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists vj_exige_foto on public.visitas_justificadas;
create trigger vj_exige_foto before insert or update on public.visitas_justificadas for each row execute function public.vj_exige_foto();
