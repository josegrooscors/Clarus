// Cámara en vivo: la foto solo se puede tomar en el momento (no hay acceso a la galería)
const Camara = {
  async abrir({ titulo = "Tomar foto", marca = "", alta = false } = {}) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: alta ? 2560 : 1920 }, height: { ideal: alta ? 1440 : 1080 } },
      });
    } catch (e) {
      throw new Error("No se pudo abrir la cámara. Revisa el permiso de cámara para esta app.");
    }
    return new Promise((resolve) => {
      const el = document.createElement("div");
      el.className = "full";
      el.innerHTML = `<div class="head"><button class="txtbtn" data-x>Cancelar</button><b>${esc(titulo)}</b><span style="width:70px"></span></div>
        <video playsinline autoplay muted></video>
        <div class="bar"><span style="width:70px"></span><button class="shutter" data-shot aria-label="Tomar foto"></button><span style="width:70px"></span></div>`;
      document.body.appendChild(el);
      const v = $("video", el); v.srcObject = stream;
      const cerrar = (r) => { stream.getTracks().forEach((t) => t.stop()); el.remove(); resolve(r); };
      $("[data-x]", el).onclick = () => cerrar(null);
      $("[data-shot]", el).onclick = async () => {
        if (!v.videoWidth) return;
        const c = document.createElement("canvas");
        c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext("2d").drawImage(v, 0, 0);
        const tomadaEn = new Date().toISOString();
        stream.getTracks().forEach((t) => t.stop());
        el.remove();
        resolve({ canvas: c, at: tomadaEn, marca });
      };
    });
  },

  // Foto de evidencia: reduce tamaño y estampa fecha, hora y tienda
  async evidencia(opts) {
    const r = await this.abrir(opts);
    if (!r) return null;
    const max = 1600, s = Math.min(1, max / Math.max(r.canvas.width, r.canvas.height));
    const c = document.createElement("canvas");
    c.width = Math.round(r.canvas.width * s); c.height = Math.round(r.canvas.height * s);
    const g = c.getContext("2d");
    g.drawImage(r.canvas, 0, 0, c.width, c.height);
    const txt = `${new Date(r.at).toLocaleString("es-PA")}  ·  ${opts?.marca || ""}`;
    const fs = Math.max(16, Math.round(c.width / 45));
    g.font = `600 ${fs}px Inter, sans-serif`;
    const w = g.measureText(txt).width + fs;
    g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(0, c.height - fs * 2, Math.min(c.width, w + fs), fs * 2);
    g.fillStyle = "#fff"; g.fillText(txt, fs, c.height - fs * 0.65);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.72));
    const thumb = c.toDataURL("image/jpeg", 0.4);
    return { blob, thumb, at: r.at };
  },
};
