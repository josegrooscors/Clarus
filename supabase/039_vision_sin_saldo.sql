-- 039 · Visión: estado "sin_saldo" (aplicado 18-nov-2026).
-- Si la API de Anthropic responde sin saldo, clave inválida, límite o servicio saturado, la foto queda en "sin_saldo"
-- (vision_pendientes la vuelve a tomar, porque solo excluye 'listo' y 'error') y la función deja de llamar en esa corrida.
alter table foto_analisis drop constraint foto_analisis_estado_check,
  add constraint foto_analisis_estado_check check (estado = any (array['pendiente','listo','error','sin_clave','sin_saldo']));
