-- 029: planogramas.muebles jsonb = [{mueble, niveles, posiciones, celdas, porNivel?}, ...]
-- Una exhibición (planograma) puede tener varios muebles (ej.: nevera abierta + vitrina deli), cada uno con sus propios frentes.
-- Las columnas mueble/niveles/posiciones/celdas siguen guardando el primer mueble (compatibilidad). Los existentes se pasaron a la lista.
-- En la app: tocar otro tipo de mueble cuando el actual ya tiene frentes agrega un mueble nuevo (no copia los frentes).
alter table public.planogramas add column if not exists muebles jsonb;
