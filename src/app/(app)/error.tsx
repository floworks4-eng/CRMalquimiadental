'use client'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="glass mx-auto mt-10 max-w-md p-8 text-center">
      <h1 className="title-gold text-2xl">Algo salió mal</h1>
      <p className="mt-2 text-sm text-muted">No pudimos cargar esta pantalla. Intenta de nuevo; si sigue pasando, avisa al administrador.</p>
      <button className="btn btn-primary mt-5" onClick={reset}>Reintentar</button>
    </div>
  )
}
