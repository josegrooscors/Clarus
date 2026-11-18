// Escáner de documentos: foto → detección de bordes → corrección de perspectiva → blanco y negro → PDF
const Escaner = {
  // Flujo completo; devuelve { blob (PDF), paginas, miniaturas } o null
  async escanear({ titulo = "Escanear orden" } = {}) {
    const paginas = [];
    while (true) {
      const foto = await Camara.abrir({ titulo: `${titulo} · página ${paginas.length + 1}`, alta: true, guia: true });
      if (!foto) { if (!paginas.length) return null; }
      else {
        const pag = await this.recortar(foto.canvas, foto.guia);
        if (pag) paginas.push(pag);
      }
      if (!paginas.length) continue;
      const accion = await this.resumen(paginas);
      if (accion === "mas") continue;
      if (accion === "cancelar") return null;
      break;
    }
    const pdf = this.pdf(paginas);
    return { blob: pdf, paginas: paginas.length, miniaturas: paginas.map((p) => p.toDataURL("image/jpeg", 0.3)) };
  },

  // Pantalla para ajustar las 4 esquinas
  recortar(src, guia) {
    return new Promise((resolve) => {
      const quad = this.detectar(src, guia);
      const el = document.createElement("div");
      el.className = "full";
      el.innerHTML = `<div class="head"><button class="txtbtn" data-x>Repetir</button><b>Ajusta el recorte</b><button class="txtbtn" data-ok>Usar</button></div>
        <div class="cropwrap"><canvas></canvas><svg><polygon fill="rgba(47,91,234,.18)" stroke="#8FB0FF" stroke-width="2"/></svg></div>
        <div class="bar" style="justify-content:center"><span class="small" style="opacity:.8">Si el recorte ya calza, toca «Usar». Si no, arrastra una esquina o un lado.</span></div>`;
      document.body.appendChild(el);
      const wrap = $(".cropwrap", el), cv = $("canvas", el), poly = $("polygon", el);
      const disp = Math.min(1, 1400 / Math.max(src.width, src.height));
      cv.width = Math.round(src.width * disp); cv.height = Math.round(src.height * disp);
      cv.getContext("2d").drawImage(src, 0, 0, cv.width, cv.height);
      const hs = quad.map(() => { const h = document.createElement("div"); h.className = "handle"; wrap.appendChild(h); return h; });
      // Asas en la mitad de cada lado: mueven el lado completo (como recortar una captura de pantalla)
      const ls = quad.map(() => { const h = document.createElement("div"); h.className = "handle lado"; wrap.appendChild(h); return h; });
      const geo = () => { const r = cv.getBoundingClientRect(), w = wrap.getBoundingClientRect(); return { ox: r.left - w.left, oy: r.top - w.top, s: r.width / src.width }; };
      const pintar = () => {
        const g = geo();
        hs.forEach((h, i) => { h.style.left = g.ox + quad[i][0] * g.s + "px"; h.style.top = g.oy + quad[i][1] * g.s + "px"; });
        ls.forEach((h, i) => { const a = quad[i], b = quad[(i + 1) % 4]; h.style.left = g.ox + ((a[0] + b[0]) / 2) * g.s + "px"; h.style.top = g.oy + ((a[1] + b[1]) / 2) * g.s + "px"; });
        poly.setAttribute("points", quad.map((p) => `${g.ox + p[0] * g.s},${g.oy + p[1] * g.s}`).join(" "));
      };
      requestAnimationFrame(pintar); window.addEventListener("resize", pintar);
      hs.forEach((h, i) => {
        h.addEventListener("pointerdown", (e) => {
          h.setPointerCapture(e.pointerId);
          const mover = (ev) => {
            const g = geo(), w = wrap.getBoundingClientRect();
            quad[i] = [Math.max(0, Math.min(src.width, (ev.clientX - w.left - g.ox) / g.s)), Math.max(0, Math.min(src.height, (ev.clientY - w.top - g.oy) / g.s))];
            pintar();
          };
          h.addEventListener("pointermove", mover);
          h.addEventListener("pointerup", () => h.removeEventListener("pointermove", mover), { once: true });
        });
      });
      ls.forEach((h, i) => {
        h.addEventListener("pointerdown", (e) => {
          h.setPointerCapture(e.pointerId);
          const ia = i, ib = (i + 1) % 4, a0 = [...quad[ia]], b0 = [...quad[ib]], x0 = e.clientX, y0 = e.clientY;
          // normal del lado: el lado se mueve hacia afuera o adentro, sin girar
          const dx = b0[0] - a0[0], dy = b0[1] - a0[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
          const mover = (ev) => {
            const g = geo(), d = ((ev.clientX - x0) * nx + (ev.clientY - y0) * ny) / g.s;
            const cl = (p) => [Math.max(0, Math.min(src.width, p[0])), Math.max(0, Math.min(src.height, p[1]))];
            quad[ia] = cl([a0[0] + nx * d, a0[1] + ny * d]); quad[ib] = cl([b0[0] + nx * d, b0[1] + ny * d]);
            pintar();
          };
          h.addEventListener("pointermove", mover);
          h.addEventListener("pointerup", () => h.removeEventListener("pointermove", mover), { once: true });
        });
      });
      const fin = (r) => { window.removeEventListener("resize", pintar); el.remove(); resolve(r); };
      $("[data-x]", el).onclick = () => fin(null);
      $("[data-ok]", el).onclick = () => {
        $("[data-ok]", el).textContent = "Procesando…";
        setTimeout(() => fin(this.mejorar(this.enderezar(src, quad))), 30);
      };
    });
  },

  resumen(paginas) {
    return new Promise((resolve) => {
      const el = document.createElement("div");
      el.className = "full";
      el.innerHTML = `<div class="head"><button class="txtbtn" data-c>Cancelar</button><b>${paginas.length} página(s)</b><span style="width:70px"></span></div>
        <div class="cropwrap"><img style="max-width:92%;max-height:100%;background:#fff;border-radius:4px"></div>
        <div class="pages"></div>
        <div class="bar"><button class="btn sec" data-mas>+ Otra página</button><button class="btn" data-fin>Listo</button></div>`;
      document.body.appendChild(el);
      $("img", el).src = paginas[paginas.length - 1].toDataURL("image/jpeg", 0.6);
      const pg = $(".pages", el);
      paginas.forEach((p) => { const i = new Image(); i.src = p.toDataURL("image/jpeg", 0.25); i.onclick = () => ($("img", el).src = p.toDataURL("image/jpeg", 0.6)); pg.appendChild(i); });
      const fin = (r) => { el.remove(); resolve(r); };
      $("[data-c]", el).onclick = () => fin("cancelar");
      $("[data-mas]", el).onclick = () => fin("mas");
      $("[data-fin]", el).onclick = () => fin("listo");
    });
  },

  // Detección automática de la hoja: zona blanca que contiene el centro del marco guía. La máscara se "adelgaza" para separar
  // la hoja de papeles que la tocan. Si el resultado no es creíble (o no calza con el marco), el recorte es el marco guía.
  detectar(src, guia) {
    const W = 360, s = W / src.width, H = Math.round(src.height * s);
    const gq = guia || [0.07, 0.07, 0.93, 0.93];
    const def = [[gq[0] * src.width, gq[1] * src.height], [gq[2] * src.width, gq[1] * src.height], [gq[2] * src.width, gq[3] * src.height], [gq[0] * src.width, gq[3] * src.height]];
    try {
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(src, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data, n = W * H, gray = new Uint8Array(n);
      // "blancura": el canal más bajo (el papel blanco es alto en los 3; una carpeta beige o amarilla tiene poco azul)
      for (let i = 0; i < n; i++) gray[i] = Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
      // bordes fuertes (sombra o canto de la hoja) funcionan como barrera entre la hoja y lo que tiene detrás
      const borde = new Uint8Array(n);
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; const gx = gray[i + 1] - gray[i - 1], gy = gray[i + W] - gray[i - W]; if (gx * gx + gy * gy > 22 * 22) borde[i] = 1; }
      // zona de búsqueda: el marco guía con 18% de holgura
      const mx = (gq[2] - gq[0]) * 0.1, my = (gq[3] - gq[1]) * 0.1;
      const X0 = Math.max(0, ((gq[0] - mx) * W) | 0), X1 = Math.min(W - 1, ((gq[2] + mx) * W) | 0), Y0 = Math.max(0, ((gq[1] - my) * H) | 0), Y1 = Math.min(H - 1, ((gq[3] + my) * H) | 0);
      const hist = new Array(256).fill(0); let tot = 0;
      for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) { hist[gray[y * W + x]]++; tot++; }
      let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
      let sB = 0, wB = 0, best = 0, th = 160;
      for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = tot - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = t; } }
      let m = new Uint8Array(n);
      for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) m[y * W + x] = gray[y * W + x] > th && !borde[y * W + x] ? 1 : 0;
      // erosión 3×3 (2 pasadas): corta puentes finos entre la hoja y otros papeles
      const E = 3;
      for (let k = 0; k < E; k++) {
        const o = new Uint8Array(n);
        for (let y = Y0 + 1; y < Y1; y++) for (let x = X0 + 1; x < X1; x++) { const i = y * W + x; o[i] = m[i] && m[i - 1] && m[i + 1] && m[i - W] && m[i + W] && m[i - W - 1] && m[i - W + 1] && m[i + W - 1] && m[i + W + 1] ? 1 : 0; }
        m = o;
      }
      // semilla: el píxel claro más cercano al centro del marco
      const cx = (((gq[0] + gq[2]) / 2) * W) | 0, cy = (((gq[1] + gq[3]) / 2) * H) | 0;
      let seed = -1;
      for (let r = 0; r < Math.max(W, H) / 3 && seed < 0; r += 2) for (let a = 0; a < 16 && seed < 0; a++) {
        const x = Math.round(cx + r * Math.cos((a * Math.PI) / 8)), y = Math.round(cy + r * Math.sin((a * Math.PI) / 8));
        if (x >= 0 && y >= 0 && x < W && y < H && m[y * W + x]) seed = y * W + x;
      }
      if (seed < 0) return def;
      const lab = new Uint8Array(n), pila = new Int32Array(n); let sp = 0, tam = 0; pila[sp++] = seed; lab[seed] = 1;
      let tl = [0, 0, 1e9], tr = [0, 0, -1e9], br = [0, 0, -1e9], bl = [0, 0, 1e9];
      while (sp) {
        const p = pila[--sp]; tam++; const x = p % W, y = (p / W) | 0, sm = x + y, df = x - y;
        if (sm < tl[2]) tl = [x, y, sm]; if (sm > br[2]) br = [x, y, sm]; if (df > tr[2]) tr = [x, y, df]; if (df < bl[2]) bl = [x, y, df];
        for (const q of [p - 1, p + 1, p - W, p + W]) if (q >= 0 && q < n && !lab[q] && m[q] && Math.abs((q % W) - x) <= 1) { lab[q] = 1; pila[sp++] = q; }
      }
      const areaGuia = (gq[2] - gq[0]) * W * (gq[3] - gq[1]) * H;
      if (tam < areaGuia * 0.25 || tam > areaGuia * 1.9) return def; // demasiado chico o se pegó al fondo
      // compensar la erosión: abrir las esquinas desde el centro
      let pts = [tl, tr, br, bl].map((p) => [p[0], p[1]]);
      const ccx = pts.reduce((t, p) => t + p[0], 0) / 4, ccy = pts.reduce((t, p) => t + p[1], 0) / 4;
      pts = pts.map(([x, y]) => { const L = Math.hypot(x - ccx, y - ccy) || 1; return [x + ((x - ccx) / L) * (E + 1), y + ((y - ccy) / L) * (E + 1)]; });
      const quad = pts.map(([x, y]) => [Math.max(0, Math.min(src.width, x / s)), Math.max(0, Math.min(src.height, y / s))]);
      // que sea un cuadrilátero creíble (lados no degenerados)
      const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      const lados = [0, 1, 2, 3].map((i) => len(quad[i], quad[(i + 1) % 4]));
      if (Math.min(...lados) < Math.max(...lados) * 0.35) return def;
      // confianza: con marco guía, cada esquina detectada debe quedar cerca de la esquina del marco (la persona encuadró la hoja ahí)
      if (guia) {
        // esquina por esquina: si la detectada se aleja más de 8% del marco, se usa la esquina del marco
        const tolX = (gq[2] - gq[0]) * src.width * 0.08, tolY = (gq[3] - gq[1]) * src.height * 0.08;
        return quad.map((p, i) => (Math.abs(p[0] - def[i][0]) > tolX || Math.abs(p[1] - def[i][1]) > tolY ? def[i] : p));
      }
      return quad;
    } catch (e) { return def; }
  },

  // Corrección de perspectiva (homografía) a tamaño carta/A4
  enderezar(src, q) {
    const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const wq = (len(q[0], q[1]) + len(q[3], q[2])) / 2, hq = (len(q[0], q[3]) + len(q[1], q[2])) / 2;
    const vertical = hq >= wq;
    const W = vertical ? 1240 : 1754, H = vertical ? 1754 : 1240; // 150 ppp
    const dst = [[0, 0], [W, 0], [W, H], [0, H]];
    const Hm = this.homografia(dst, q);
    const sc = src.getContext("2d", { willReadFrequently: true });
    const sd = sc.getImageData(0, 0, src.width, src.height).data, sw = src.width, sh = src.height;
    const out = document.createElement("canvas"); out.width = W; out.height = H;
    const oc = out.getContext("2d"), od = oc.createImageData(W, H), o = od.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const z = Hm[6] * x + Hm[7] * y + 1;
      const sx = (Hm[0] * x + Hm[1] * y + Hm[2]) / z, sy = (Hm[3] * x + Hm[4] * y + Hm[5]) / z;
      const x0 = Math.max(0, Math.min(sw - 2, sx | 0)), y0 = Math.max(0, Math.min(sh - 2, sy | 0));
      const fx = Math.min(1, Math.max(0, sx - x0)), fy = Math.min(1, Math.max(0, sy - y0));
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4, oi = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) o[oi + k] = (sd[i00 + k] * (1 - fx) + sd[i10 + k] * fx) * (1 - fy) + (sd[i01 + k] * (1 - fx) + sd[i11 + k] * fx) * fy;
      o[oi + 3] = 255;
    }
    oc.putImageData(od, 0, 0);
    return out;
  },

  homografia(a, b) { // matriz que lleva puntos a -> b
    const A = [], B = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = a[i], [u, v] = b[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
    }
    for (let c = 0; c < 8; c++) { // Gauss
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [B[c], B[p]] = [B[p], B[c]];
      for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; B[r] -= f * B[c]; }
    }
    return B.map((v, i) => v / A[i][i]);
  },

  // Efecto "documento": fondo blanco, texto negro nítido
  mejorar(c) {
    const W = c.width, H = c.height, g = c.getContext("2d", { willReadFrequently: true });
    const bg = document.createElement("canvas"); bg.width = Math.max(1, W >> 4); bg.height = Math.max(1, H >> 4);
    const bgc = bg.getContext("2d"); bgc.imageSmoothingQuality = "high"; bgc.drawImage(c, 0, 0, bg.width, bg.height);
    const big = document.createElement("canvas"); big.width = W; big.height = H;
    const bigc = big.getContext("2d", { willReadFrequently: true }); bigc.imageSmoothingQuality = "high"; bigc.filter = "blur(6px)"; bigc.drawImage(bg, 0, 0, W, H);
    const img = g.getImageData(0, 0, W, H), d = img.data, b = bigc.getImageData(0, 0, W, H).data;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114, f = b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114 || 1;
      let r = Math.min(255, (v / f) * 255);
      r = r > 215 ? 255 : Math.max(0, (r - 70) * 1.75); // contraste
      d[i] = d[i + 1] = d[i + 2] = r;
    }
    g.putImageData(img, 0, 0);
    return c;
  },

  pdf(paginas) {
    const { jsPDF } = window.jspdf;
    let doc = null;
    paginas.forEach((p, i) => {
      const vertical = p.height >= p.width, f = vertical ? "p" : "l";
      if (!doc) doc = new jsPDF({ orientation: f, unit: "mm", format: "letter", compress: true });
      else doc.addPage("letter", f);
      const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
      const s = Math.min(pw / p.width, ph / p.height), w = p.width * s, h = p.height * s;
      doc.addImage(p.toDataURL("image/jpeg", 0.7), "JPEG", (pw - w) / 2, (ph - h) / 2, w, h, undefined, "FAST");
    });
    return doc.output("blob");
  },
};
