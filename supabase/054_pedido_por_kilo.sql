-- 20-nov-2026 · Aplicado en el servidor (migración pedido_por_kilo) y validado con Demo y Heberto en bloque que se deshace.
-- Pedido por kilo: la línea guarda los kilos pedidos; `propuesto` sigue en cajas (equivalente). Vacío = por caja.
alter table public.pedido_items add column if not exists kg_pedido numeric(10,2);
alter table public.pedido_items add constraint pedido_items_kg_pedido_check check (kg_pedido is null or kg_pedido > 0);
