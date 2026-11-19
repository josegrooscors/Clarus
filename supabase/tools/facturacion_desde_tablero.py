#!/usr/bin/env python3
"""Venta facturada y merma por tienda, producto y mes, desde el Tablero Comercial (script vc-data de su index.html).

Uso: python3 facturacion_desde_tablero.py vc.json clientes.json [desde AAAA-MM] > datos.txt
  vc.json       = JSON del <script id="vc-data"> del Tablero Comercial (artifact 09a2087c…)
  clientes.json = [[id, codigo], …] de la tabla clientes de Clarus
Salida: filas compactas «AAMM,cliente,producto,kg,usd,merma,notas» separadas por «;» para public.cargar_facturacion().
Reglas (las mismas del Tablero Comercial): sin facturas anuladas, códigos unificados con `merge`, correcciones de precio
restadas de la factura; merma = notas de crédito MERMA + DIFERENCIA PESO/ENTREGA. Producto 0 = nota sin detalle de producto.
"""
import json, sys, collections
D = json.load(open(sys.argv[1])); CL = {c: i for i, c in json.load(open(sys.argv[2]))}
desde = sys.argv[3] if len(sys.argv) > 3 else "2026-01"
PROD = {"013": 2, "014": 3}  # Mozzarella, Muenster en Clarus
mgd = D["merge"]
def mg(s):
    while s in mgd: s = mgd[s]
    return s
an = set(D["anuladas"]); aj = collections.defaultdict(float)
for a in D.get("ajustesPrecio", []): aj[(a[0], a[1])] += a[2]
A = collections.defaultdict(lambda: [0.0, 0.0, 0.0, 0]); fuera = collections.defaultdict(float); visto = set()
for f, d, s, p, kg, pr, usd, *_ in D["rows"]:
    if f in an or d[:7] < desde: continue
    if (f, p) in aj and (f, p) not in visto: usd += aj[(f, p)]; visto.add((f, p))
    c = CL.get(mg(s))
    if c is None: fuera["venta " + mg(s)] += usd; continue
    x = A[(d[:7], c, PROD[p])]; x[0] += kg; x[1] += usd
for n, d, s, tipo, p, usd, *_ in D["nc"]:
    if tipo not in ("MERMA", "DIFERENCIA PESO/ENTREGA") or d[:7] < desde: continue
    c = CL.get(mg(s))
    if c is None: fuera["merma " + mg(s)] += usd; continue
    x = A[(d[:7], c, PROD.get(p, 0))]; x[2] += usd; x[3] += 1
n = lambda v: ("%.2f" % v).rstrip("0").rstrip(".") or "0"
print(";".join(f"{m[2:4]}{m[5:7]},{c},{p},{n(x[0])},{n(x[1])},{n(x[2])},{x[3]}" for (m, c, p), x in sorted(A.items())))
tot = collections.defaultdict(lambda: [0.0, 0.0])
for (m, c, p), x in A.items(): tot[m][0] += x[1]; tot[m][1] += x[2]
for m in sorted(tot): print(m, "venta", round(tot[m][0], 2), "merma", round(tot[m][1], 2), file=sys.stderr)
print("FUERA (sin tienda en Clarus):", {k: round(v, 2) for k, v in fuera.items()}, file=sys.stderr)
print("filas", len(A), "corte", D.get("updated"), file=sys.stderr)
