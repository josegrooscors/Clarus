-- Aplicada el 15-nov-2026
drop trigger if exists trg_fijar_coord on visitas;
alter table fotos drop constraint fotos_tipo_check;
alter table fotos add constraint fotos_tipo_check
  check (tipo in ('bodega','exhibicion_deli','exhibicion_empacado','antes','despues','exhibicion','promocion','otro'));
-- + reglas de edición/anulación de pedidos y ubicación de El Fuerte San Miguelito
