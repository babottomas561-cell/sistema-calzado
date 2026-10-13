import { FileX2 } from "lucide-react";

export const metadata = { title: "Comprobante no disponible", robots: { index: false, follow: false } };

export default function ComprobanteNoDisponible() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-marca-suave text-marca"><FileX2 size={26} strokeWidth={1.6} /></span>
      <h1 className="text-xl font-bold">Este comprobante ya no está disponible</h1>
      <p className="text-sm text-texto-2">El link puede estar mal copiado o el local lo reemplazó por otro. Pedile al local que te lo vuelva a mandar.</p>
    </main>
  );
}
