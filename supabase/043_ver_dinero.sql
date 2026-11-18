-- 043 · Permiso «Ver montos en dólares» y Metas fuera del rol supervisor (aplicado 18-nov-2026, a pedido de José).
-- Nuevo permiso ver_dinero: sin él, objetivos y ventas se muestran SOLO en kilos (Metas, Agenda, tarjeta «Mi objetivo» de la vendedora, Picking sin monto).
-- Por defecto: administracion sí; vendedor, supervisor y operaciones no. El administrador siempre ve dólares y, además, los kilos.
-- Supervisor: ver_metas = false (no ve la pantalla de Metas ni la facturación total).
-- Límite: es un filtro de pantalla. Las columnas objetivo_usd / venta_usd siguen viajando en la consulta; cerrarlo en el servidor requiere vistas sin esas columnas.
alter table public.permisos_rol drop constraint permisos_rol_permiso_check;
alter table public.permisos_rol add constraint permisos_rol_permiso_check check (permiso = any (array['tiendas','ubicacion','rutas','productos','usuarios','visitar','ver_resumen','ver_equipo','ver_agenda','ver_metas','ver_pedidos','ver_mapa','ver_dinero','avisar','pedidos_imprimir','planogramas','picking']));
insert into public.permisos_rol (empresa_id, rol, permiso, permitido)
select e.id, x.rol, 'ver_dinero', x.ok from empresas e cross join (values ('vendedor',false),('supervisor',false),('operaciones',false),('administracion',true)) x(rol, ok)
on conflict (empresa_id, rol, permiso) do nothing;
update public.permisos_rol set permitido = false where rol = 'supervisor' and permiso = 'ver_metas';
