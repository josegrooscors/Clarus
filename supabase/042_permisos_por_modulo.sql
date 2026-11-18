-- 042 · Permisos por módulo y por rol (aplicado 18-nov-2026, a pedido de José).
-- permisos_rol ahora cubre 16 permisos en 4 grupos y 4 roles (vendedor, supervisor, operaciones, administracion):
--   Ejecución: visitar, ubicacion · Consulta: ver_resumen, ver_equipo, ver_agenda, ver_metas, ver_pedidos, ver_mapa
--   Acciones: avisar, pedidos_imprimir, planogramas, picking · Configuración: tiendas, rutas, productos, usuarios
-- Se sembraron filas para todos los roles con el comportamiento que ya tenían, salvo SUPERVISOR, que queda como pidió José:
--   ejecuta visitas y consulta (Resumen, Equipo, Agenda, Metas, Pedidos, Mapa) y puede «Avisar»; sin tiendas, rutas, productos, usuarios, planogramas, picking ni imprimir.
-- En el servidor: tiendas/rutas/productos/usuarios ya se validaban con private.puede(); ahora también planogramas (pl_esc, plt_esc) y comunicados (com_ins → 'avisar').
-- Los permisos de consulta (ver_*) y pedidos_imprimir solo ocultan pantallas y botones en la app; la lectura en servidor sigue por es_gestor().
-- La app usa DB.puede() con PERM_DEF (valores por defecto por rol) cuando el teléfono aún no bajó la tabla nueva.
alter table public.permisos_rol drop constraint permisos_rol_permiso_check, drop constraint permisos_rol_rol_check;
alter table public.permisos_rol
  add constraint permisos_rol_permiso_check check (permiso = any (array['tiendas','ubicacion','rutas','productos','usuarios','visitar','ver_resumen','ver_equipo','ver_agenda','ver_metas','ver_pedidos','ver_mapa','avisar','pedidos_imprimir','planogramas','picking'])),
  add constraint permisos_rol_rol_check check (rol = any (array['supervisor','operaciones','administracion','vendedor']));
alter policy pl_esc on public.planogramas using ((empresa_id = (select private.mi_empresa())) and (select private.puede('planogramas'))) with check ((empresa_id = (select private.mi_empresa())) and (select private.puede('planogramas')));
alter policy plt_esc on public.planograma_tiendas using ((select private.puede('planogramas')) and exists (select 1 from planogramas p where p.id = planograma_tiendas.planograma_id)) with check ((select private.puede('planogramas')) and exists (select 1 from planogramas p where p.id = planograma_tiendas.planograma_id));
alter policy com_ins on public.comunicados with check ((empresa_id = (select private.mi_empresa())) and (select private.puede('avisar')));
