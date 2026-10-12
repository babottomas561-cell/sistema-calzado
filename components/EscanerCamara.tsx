"use client";
// Escáner de códigos de barras con la cámara del celular. Usa el lector que trae el navegador (BarcodeDetector, rápido,
// en Chrome de Android) y, si no lo tiene (iPhone, Windows), ZXing, que se baja recién cuando se abre. Queda abierto para
// escanear varios seguidos; el llamador contesta con un mensaje de lo que pasó con cada lectura.
import { useEffect, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Flashlight, FlashlightOff, X } from "lucide-react";

type Detector = { detect: (el: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type ClaseDetector = (new (o: { formats: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> };
const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

export type Aviso = { tipo: "ok" | "error"; texto: string } | null;

export default function EscanerCamara({ alLeer, alCerrar, aviso, titulo = "Escaneá el código de barras" }: {
  alLeer: (codigo: string) => void; alCerrar: () => void; aviso: Aviso; titulo?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [linterna, setLinterna] = useState<boolean | null>(null);   // null = este celular no la tiene
  const ultimo = useRef({ codigo: "", t: 0 });
  const alLeerRef = useRef(alLeer);
  useEffect(() => { alLeerRef.current = alLeer; });

  useEffect(() => {
    let parar = false;
    const elVideo = video.current;   // el nodo no cambia mientras el escáner está abierto: se guarda para la limpieza
    let stream: MediaStream | null = null;
    let controles: { stop: () => void } | null = null;
    // La misma lectura seguida no se repite (la cámara ve el código muchas veces por segundo)
    const leyo = (codigo: string) => {
      const ahora = Date.now();
      if (codigo === ultimo.current.codigo && ahora - ultimo.current.t < 1800) return;
      ultimo.current = { codigo, t: ahora };
      navigator.vibrate?.(60);
      alLeerRef.current(codigo);
    };
    const hayLinterna = () => {
      const pista = (video.current?.srcObject as MediaStream | null)?.getVideoTracks()[0];
      const capacidades = pista?.getCapabilities?.() as { torch?: boolean } | undefined;
      setLinterna(capacidades?.torch ? false : null);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setError("La cámara solo anda en una conexión segura (https)."); return; }
      try {
        const Nativo = (window as unknown as { BarcodeDetector?: ClaseDetector }).BarcodeDetector;
        const soportados = Nativo?.getSupportedFormats ? await Nativo.getSupportedFormats() : [];
        if (Nativo && soportados.includes("ean_13")) {
          const detector = new Nativo({ formats: FORMATOS.filter((f) => soportados.includes(f)) });
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
          if (parar) { stream.getTracks().forEach((t) => t.stop()); return; }
          const v = video.current!;
          v.srcObject = stream;
          await v.play();
          hayLinterna();
          const mirar = async () => {
            if (parar) return;
            try { const r = await detector.detect(v); if (r[0]?.rawValue) leyo(r[0].rawValue); } catch { /* un cuadro que no se pudo leer */ }
            setTimeout(mirar, 120);
          };
          mirar();
        } else {
          const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
          const pistas = new Map();
          pistas.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF]);
          const lector = new BrowserMultiFormatReader(pistas, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 600 });
          const c = await lector.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: "environment" } } }, video.current!, (res) => { if (res) leyo(res.getText()); });
          if (parar) { c.stop(); return; }
          controles = c;
          hayLinterna();
        }
      } catch (e) {
        const nombre = (e as { name?: string }).name;
        setError(nombre === "NotAllowedError" ? "No hay permiso para usar la cámara: tocá el candado de la barra de direcciones y permitila."
          : nombre === "NotFoundError" ? "Este equipo no tiene cámara." : "No se pudo abrir la cámara. Probá cerrar otras apps que la estén usando.");
      }
    })();

    return () => { parar = true; controles?.stop(); stream?.getTracks().forEach((t) => t.stop()); const s = elVideo?.srcObject as MediaStream | null; s?.getTracks().forEach((t) => t.stop()); };
  }, []);

  async function prenderLinterna() {
    const pista = (video.current?.srcObject as MediaStream | null)?.getVideoTracks()[0];
    if (!pista) return;
    const nueva = !linterna;
    try { await pista.applyConstraints({ advanced: [{ torch: nueva } as MediaTrackConstraintSet] }); setLinterna(nueva); } catch { /* sin linterna */ }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={titulo} className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90 p-4 text-white">
      <div className="flex w-full max-w-md items-center justify-between">
        <p className="font-semibold">{titulo}</p>
        <div className="flex gap-2">
          {linterna !== null && <button type="button" onClick={prenderLinterna} aria-pressed={linterna} aria-label="Linterna" className="grid h-10 w-10 place-items-center rounded-full bg-white/15 hover:bg-white/25">{linterna ? <FlashlightOff size={18} /> : <Flashlight size={18} />}</button>}
          <button type="button" onClick={alCerrar} aria-label="Cerrar la cámara" className="grid h-10 w-10 place-items-center rounded-full bg-white/15 hover:bg-white/25"><X size={18} /></button>
        </div>
      </div>
      <div className="relative aspect-[4/3] w-full max-w-md overflow-hidden rounded-2xl bg-black">
        <video ref={video} muted playsInline className="h-full w-full object-cover" />
        <div aria-hidden className="pointer-events-none absolute inset-x-[10%] top-1/2 h-[28%] -translate-y-1/2 rounded-lg border-2 border-white/80" />
      </div>
      {error ? <p className="flex max-w-md items-start gap-2 rounded-lg bg-red-900/70 p-3 text-sm" role="alert"><CircleAlert size={18} className="mt-0.5 shrink-0" /> {error}</p>
        : <p className="max-w-md text-center text-sm text-white/75">Apuntá al código de barras de la etiqueta. Se queda abierta: podés escanear varios seguidos.</p>}
      <p aria-live="polite" className={`flex min-h-10 max-w-md items-center gap-2 rounded-lg px-3 py-2 text-sm ${aviso ? (aviso.tipo === "ok" ? "bg-green-900/70" : "bg-red-900/70") : ""}`}>
        {aviso && (aviso.tipo === "ok" ? <CircleCheck size={16} className="shrink-0" /> : <CircleAlert size={16} className="shrink-0" />)}{aviso?.texto}</p>
      <button type="button" onClick={alCerrar} className="rounded-lg border border-white/40 px-5 py-2.5 font-semibold hover:bg-white/10">Listo</button>
    </div>
  );
}
