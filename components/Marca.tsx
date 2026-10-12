// Marca en la cabecera y el pie de la tienda pública: el logo que cargó el local o, si no hay, el nombre en tipografía
// (el nombre sale de Tablas → Tienda). Con una versión para fondo oscuro, la cabecera transparente sobre una campaña
// con foto la usa sola (globals.css: .logo-claro / .logo-oscuro).
export default function Marca({ nombre, logo, logoOscuro, className = "" }: { nombre: string; logo?: string | null; logoOscuro?: string | null; className?: string }) {
  if (!logo) return <span className={`text-[1.35rem] font-extrabold leading-none tracking-[-0.045em] ${className}`}>{nombre}</span>;
  return (
    <>
      <img src={logo} alt={nombre} className={`logo-claro block h-9 w-auto max-w-[180px] object-contain object-left ${className}`} />
      {logoOscuro && <img src={logoOscuro} alt="" aria-hidden className={`logo-oscuro h-9 w-auto max-w-[180px] object-contain object-left ${className}`} />}
    </>
  );
}
