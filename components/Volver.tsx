import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// Enlace "volver" de las fichas: ícono + destino
export default function Volver({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-marca hover:underline">
      <ChevronLeft size={16} /> {children}
    </Link>
  );
}
