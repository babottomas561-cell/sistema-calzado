// Nombre de la tienda en la cabecera pública: solo tipografía (el nombre sale de Tablas → Tienda).
export default function Marca({ nombre, className = "" }: { nombre: string; className?: string }) {
  return <span className={`text-[1.35rem] font-extrabold leading-none tracking-[-0.045em] ${className}`}>{nombre}</span>;
}
