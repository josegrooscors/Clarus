-- Clarus · Cada vendedora solo ve los objetivos y lo facturado de sus propias tiendas.
-- Administrador, supervisor y operaciones ven todo.
drop policy if exists obj_ver on objetivos;
create policy obj_ver on objetivos for select using (
  empresa_id = private.mi_empresa() and (
    private.es_gestor()
    or exists (select 1 from asignacion_tiendas a where a.cliente_id = objetivos.cliente_id and a.vendedor_id = auth.uid())
  )
);
