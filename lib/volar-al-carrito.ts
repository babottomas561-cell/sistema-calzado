// «Agregar al carrito»: la foto vuela hasta el ícono del carrito y el contador rebota (Motion, MIT:
// https://github.com/motiondivision/motion, cargado recién al usarlo). Con «menos movimiento» solo rebota el contador.
export async function volarAlCarrito(origen: Element | null, imagen: string | null, alternativa?: Element | null) {
  const destino = document.getElementById("boton-carrito");
  if (!destino) return;
  const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { animate } = await import("motion");
  const rebotar = () => { if (!reducido) animate(destino, { scale: [1, 1.28, 1] }, { duration: 0.45, ease: [0.22, 1, 0.36, 1] }); };
  // Sale de la foto si se ve (por lo menos 120 px); si ya la bajó de la pantalla, del botón
  const visible = (e: Element | null | undefined) => { if (!e) return false; const r = e.getBoundingClientRect(); return Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) > 120; };
  const desde = visible(origen) ? origen : alternativa ?? origen;
  if (reducido || !desde) return rebotar();

  const a = desde.getBoundingClientRect(), b = destino.getBoundingClientRect();
  const ancho = Math.min(a.width, 96), alto = ancho * 1.25;
  const x0 = a.left + a.width / 2 - ancho / 2, y0 = Math.max(a.top, 0) + Math.min(a.height / 2, 160) - alto / 2;
  const dx = b.left + b.width / 2 - (x0 + ancho / 2), dy = b.top + b.height / 2 - (y0 + alto / 2);
  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "fixed", left: `${x0}px`, top: `${y0}px`, width: `${ancho}px`, height: `${alto}px`, zIndex: "60", pointerEvents: "none",
    borderRadius: "2px", boxShadow: "0 12px 32px rgb(0 0 0 / .28)", background: imagen ? `center top / cover url("${imagen}")` : "var(--color-marca-suave, #eee)",
  });
  document.body.appendChild(el);
  // Sube un poco (arco) y cae al carrito achicándose
  const vuelo = animate(el, {
    transform: ["translate(0px, 0px) scale(1)", `translate(${dx * 0.35}px, ${Math.min(dy * 0.35, 0) - 70}px) scale(.7)`, `translate(${dx}px, ${dy}px) scale(.12)`],
    opacity: [1, 1, 0.35],
  }, { duration: 0.75, ease: [0.5, 0, 0.2, 1] });
  await vuelo.finished.catch(() => {});
  el.remove();
  rebotar();
}
