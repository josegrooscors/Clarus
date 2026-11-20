-- 20-nov-2026 · Aplicado en el servidor (migración perfiles_inicio_clarus).
-- Fecha desde la que cada persona ejecuta su ruta en Clarus. Vacío = «Por iniciar»:
-- no acumula faltas ni programadas sin hacer; lo cargado desde Handy se sigue viendo.
alter table public.perfiles add column if not exists inicio_clarus date;
-- Viejo Cántaro: Stephanie 19-nov, Yerenis 18-nov, Yasmín 20-nov, Demo 15-nov. El resto queda vacío hasta que José lo indique.
