import { Footprints } from "lucide-react";

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-marca text-white"><Footprints size={18} strokeWidth={2.2} /></span>
      Mi Calzado
    </span>
  );
}
