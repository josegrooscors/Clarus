-- 040 · v_inventario_visita más rápida (aplicado 18-nov-2026).
-- Antes sumaba TODO el inventario y después filtraba por fecha; con las reglas de acceso el plan se degradaba (125–250 ms para el administrador).
-- Ahora parte de las visitas y suma solo el inventario de cada una (LATERAL): ~18 ms, mismas columnas y mismos resultados (0 diferencias en 1,466 filas).
-- También se quita un índice repetido de visitas.
create or replace view public.v_inventario_visita with (security_invoker=true) as
 SELECT v.id AS visita_id, v.empresa_id, v.vendedor_id, pf.nombre AS vendedor, v.cliente_id, c.nombre AS tienda, c.cadena,
    (v.checkin_at AT TIME ZONE e.zona_horaria)::date AS fecha, v.checkin_at, inv.producto_id, p.nombre AS producto, inv.unidades, inv.kg,
    inv.marcado_agotado OR inv.unidades = 0::numeric AS agotado, ap.stock_minimo, round(o.objetivo_kg / 4.33, 2) AS objetivo_semana_kg,
    CASE WHEN inv.marcado_agotado OR inv.unidades = 0::numeric THEN false
         WHEN ap.stock_minimo IS NOT NULL THEN inv.unidades <= ap.stock_minimo
         WHEN o.objetivo_kg > 0::numeric THEN inv.kg < (0.4 * (o.objetivo_kg / 4.33)) ELSE false END AS bajo,
    (EXISTS ( SELECT 1 FROM pedidos pe JOIN pedido_items it ON it.pedido_id = pe.id
          WHERE pe.estado <> 'anulado'::text AND it.producto_id = inv.producto_id AND it.propuesto > 0::numeric AND (pe.visita_id = v.id OR pe.cliente_id = v.cliente_id AND (pe.creado_at AT TIME ZONE e.zona_horaria)::date = (v.checkin_at AT TIME ZONE e.zona_horaria)::date))) AS con_pedido
   FROM visitas v
     JOIN empresas e ON e.id = v.empresa_id
     JOIN LATERAL (SELECT i.producto_id, sum(i.unidades) AS unidades, sum(i.kg) AS kg, bool_or(i.agotado) AS marcado_agotado FROM inventarios i WHERE i.visita_id = v.id GROUP BY i.producto_id) inv ON true
     JOIN clientes c ON c.id = v.cliente_id
     JOIN productos p ON p.id = inv.producto_id
     JOIN perfiles pf ON pf.id = v.vendedor_id
     LEFT JOIN asignacion_productos ap ON ap.cliente_id = v.cliente_id AND ap.producto_id = inv.producto_id
     LEFT JOIN objetivos o ON o.cliente_id = v.cliente_id AND o.producto_id = inv.producto_id AND o.mes = date_trunc('month'::text, (v.checkin_at AT TIME ZONE e.zona_horaria))::date;
drop index if exists public.visitas_empresa_id_checkin_at_idx;
