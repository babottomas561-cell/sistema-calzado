export default function Cargando() {
  return (
    <div aria-busy="true" aria-label="Cargando el producto" className="grid gap-8 lg:grid-cols-2">
      <div className="esqueleto aspect-[4/5] rounded-sm" />
      <div className="space-y-4">
        <div className="esqueleto h-4 w-24 rounded-sm" /><div className="esqueleto h-9 w-4/5 rounded-sm" /><div className="esqueleto h-8 w-32 rounded-sm" />
        <div className="flex gap-2 pt-4">{[0, 1, 2].map((i) => <div key={i} className="esqueleto h-11 w-11 rounded-full" />)}</div>
        <div className="grid grid-cols-5 gap-2">{Array.from({ length: 5 }, (_, i) => <div key={i} className="esqueleto h-12 rounded-sm" />)}</div>
        <div className="esqueleto h-12 w-full rounded-sm" />
      </div>
    </div>
  );
}
