// Mientras carga el catálogo: esqueleto con brillo (la grilla ocupa su lugar y no salta al llegar las fotos)
export default function Cargando() {
  return (
    <div aria-busy="true" aria-label="Cargando el catálogo" className="space-y-6">
      <div className="esqueleto h-10 w-64 rounded-sm" />
      <div className="flex gap-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="esqueleto h-9 w-20 rounded-sm" />)}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-3">
            <div className="esqueleto aspect-[3/4] rounded-sm" />
            <div className="esqueleto h-3 w-1/3 rounded-sm" />
            <div className="esqueleto h-4 w-4/5 rounded-sm" />
            <div className="esqueleto h-4 w-1/4 rounded-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}
