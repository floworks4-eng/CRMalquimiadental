export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">Cargando…</span>
      <div className="h-10 w-64 animate-pulse rounded-xl bg-white/6" />
      <div className="glass h-80 animate-pulse" />
    </div>
  )
}
