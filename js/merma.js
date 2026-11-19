// Merma: notas de crédito por merma sobre la venta facturada de cada tienda (fuente: Tablero Comercial).
// Semáforo: verde hasta el límite de la empresa (3 %), ámbar hasta 1.5 veces el límite, rojo después.
const MERMA = {
  lim() { return Number(DB.empresa?.merma_limite ?? 3) || 3; },
  tono(p) { const l = this.lim(); return p == null ? "" : p > l * 1.5 ? "bajo" : p > l ? "medio" : "ok"; },
  etq(p) { return { ok: "Dentro del límite", medio: "Sobre el límite", bajo: "Muy alta", "": "Sin venta" }[this.tono(p)]; },
  pill(p) { return { ok: "p-menta", medio: "p-durazno", bajo: "p-rosa", "": "p-gris" }[this.tono(p)]; },
  pc(m, v) { return v > 0 ? Math.round((m / v) * 1000) / 10 : null; },
  fp(p) { return p == null ? "–" : fmtNum(p, 1) + "%"; },
  // Los n meses que terminan en mes0 (AAAA-MM-01), del más viejo al más nuevo
  meses(mes0, n) { const y = Number(mes0.slice(0, 4)), m = Number(mes0.slice(5, 7)) - 1; return [...Array(n)].map((_, i) => { const d = new Date(Date.UTC(y, m - (n - 1 - i), 1)); return d.toISOString().slice(0, 8) + "01"; }); },
  nombreMes(mes0, largo = true) { return new Date(mes0 + "T12:00:00").toLocaleDateString("es-PA", { month: largo ? "long" : "short" }); },
  // filas = [mes, cliente, producto, kg, usd, merma]; suma venta y merma de las que cumplan
  suma(filas, si = () => true) { let m = 0, v = 0; filas.forEach((f) => { if (si(f)) { v += Number(f[4] || 0); m += Number(f[5] || 0); } }); return { m, v, p: this.pc(m, v) }; },
  // Mes en curso y los 3 meses anteriores juntos
  de(filas, mes0, si = () => true) { const ms = this.meses(mes0, 4), ant = ms.slice(0, 3); return { mes: this.suma(filas, (f) => f[0] === mes0 && si(f)), ant: this.suma(filas, (f) => ant.includes(f[0]) && si(f)) }; },
  // Merma de una tienda con lo guardado en el teléfono (sirve sin señal). null si la tienda no tiene facturación ni merma.
  tienda(cat, clienteId) {
    const fs = (cat?.merma?.filas || []).filter((f) => f[1] === clienteId); if (!fs.length) return null;
    const mes0 = mesActual(), r = this.de(fs, mes0); if (!r.mes.v && !r.mes.m && !r.ant.v && !r.ant.m) return null;
    return { ...r, mes0, corte: cat.merma.corte, lim: this.lim() };
  },
  // Texto para la vendedora al hacer check-in (sin dólares si su rol no ve dinero)
  textoTienda(t) {
    const din = conDinero(), mes = this.nombreMes(t.mes0), ref = t.mes.p ?? t.ant.p, tono = this.tono(ref);
    const titulo = t.mes.m > 0 ? (t.mes.p != null ? `Merma de esta tienda en ${mes}: ${this.fp(t.mes.p)} de la venta` : `Merma de esta tienda en ${mes}${din ? ": " + fmtUsd2(t.mes.m) : ""} (aún sin factura este mes)`)
      : t.ant.m > 0 ? `Sin merma en ${mes}. En los 3 meses anteriores: ${this.fp(t.ant.p)}` : "Sin merma registrada en esta tienda";
    const partes = [];
    if (t.mes.m > 0 && din) partes.push(`${fmtUsd2(t.mes.m)} en notas de crédito${t.mes.v ? " sobre " + fmtUsd(t.mes.v) + " facturados" : ""}`);
    if (t.mes.m > 0 && t.ant.p != null) partes.push(`3 meses anteriores: ${this.fp(t.ant.p)}`);
    partes.push(`límite ${fmtNum(t.lim, 0)}%`);
    const consejo = tono === "ok" || (!t.mes.m && !t.ant.m) ? "Sigue así: rota el producto y deja al frente lo que vence antes." : "Revisa fechas, rota el producto (al frente lo que vence antes) y pide solo lo que la tienda vende.";
    return { titulo, detalle: partes.join(" · ") + ".", consejo, tono, ref };
  },
};
const fmtUsd2 = (n) => "$" + Number(n || 0).toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
