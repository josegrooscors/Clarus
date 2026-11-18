-- 031 (17-nov-2026): visitas.sin_pedido_motivo (sin_stock | tienda_bodega | no_autoriza | pedido_central | no_hace_falta | otro) y visitas.sin_pedido_nota.
-- La vendedora elige el motivo al tocar «Sin pedido» (obligatorio si hay productos bajos o agotados) o al dejar en cero un pedido ya enviado (se anula).
-- Se ve en Resumen › Alertas de inventario junto al producto agotado sin pedido.
alter table public.visitas add column if not exists sin_pedido_motivo text;
alter table public.visitas add column if not exists sin_pedido_nota text;
