// Utilidades generales
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const fmtNum = (n, d = 1) => (n == null || isNaN(n) ? "–" : Number(n).toLocaleString("es-PA", { maximumFractionDigits: d }));
const fmtHora = (t) => (t ? new Date(t).toLocaleTimeString("es-PA", { hour: "2-digit", minute: "2-digit" }) : "–");
const fmtFecha = (t) => (t ? new Date(t).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short" }) : "–");
const fmtFechaHora = (t) => (t ? fmtFecha(t) + " · " + fmtHora(t) : "–");
const minutos = (a, b) => (a && b ? Math.round((new Date(b) - new Date(a)) / 60000) : null);
const iniciales = (s) => String(s || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const hoyISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
const diaSemana = () => { const d = new Date().getDay(); return d === 0 ? 7 : d; }; // 1=lunes

function toast(msg, ms = 2600) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}

function modal(html, onMount) {
  const m = document.createElement("div");
  m.className = "modal"; m.innerHTML = `<div class="sheet">${html}</div>`;
  m.addEventListener("click", (e) => { if (e.target === m) m.remove(); });
  document.body.appendChild(m);
  onMount && onMount(m, () => m.remove());
  return m;
}

function confirmar(texto, okTxt = "Confirmar") {
  return new Promise((res) => {
    modal(`<h2 style="margin-bottom:8px">¿Seguro?</h2><p class="muted">${esc(texto)}</p>
      <div class="row" style="margin-top:16px"><button class="btn sec sp" data-no>Cancelar</button><button class="btn sp" data-si>${esc(okTxt)}</button></div>`,
      (m, close) => {
        $("[data-no]", m).onclick = () => { close(); res(false); };
        $("[data-si]", m).onclick = () => { close(); res(true); };
      });
  });
}

// Ubicación con alta precisión
function ubicacion(timeout = 20000) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("Este teléfono no permite ubicación"));
    let best = null, done = false;
    const fin = () => { if (done) return; done = true; navigator.geolocation.clearWatch(w); best ? res(best) : rej(new Error("No se pudo obtener la ubicación. Activa el GPS.")); };
    const w = navigator.geolocation.watchPosition(
      (p) => {
        const c = { lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy) };
        if (!best || c.precision < best.precision) best = c;
        if (best.precision <= 25) fin();
      },
      (e) => { if (e.code === 1) { done = true; navigator.geolocation.clearWatch(w); rej(new Error("Permite el acceso a la ubicación para continuar")); } },
      { enableHighAccuracy: true, maximumAge: 0, timeout }
    );
    setTimeout(fin, 9000); // como máximo 9 s esperando mejor precisión
  });
}

function distanciaM(a, b) {
  const R = 6371000, r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const ESTADOS_PEDIDO = {
  propuesto: ["Por aprobar", "p-durazno"],
  aprobado: ["Aprobado · escanear orden", "p-azul"],
  rechazado: ["Rechazado", "p-rosa"],
  orden_escaneada: ["Orden escaneada", "p-lila"],
  impreso: ["Impreso", "p-menta"],
  anulado: ["Anulado", "p-gris"],
};
const pillPedido = (e) => { const [t, c] = ESTADOS_PEDIDO[e] || [e, "p-gris"]; return `<span class="pill ${c}">${t}</span>`; };
