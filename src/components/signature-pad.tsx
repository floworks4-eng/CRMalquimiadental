'use client'
import { useEffect, useRef } from 'react'
import SignaturePad from 'signature_pad'

/** Firma dibujada. Fondo claro opaco: el PNG queda legible sin importar el tema de la pagina. */
export function SignatureField({ onChange, invalid, describedBy }: { onChange: (dataUrl: string) => void; invalid?: boolean; describedBy?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const pad = useRef<SignaturePad | null>(null)
  const change = useRef(onChange)
  useEffect(() => {
    change.current = onChange
  }, [onChange])

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const p = new SignaturePad(el, { penColor: '#1e1f21', backgroundColor: 'rgb(242, 238, 230)', minWidth: 0.8, maxWidth: 2.4 })
    pad.current = p
    // El canvas se dimensiona a su tamano real (y a la densidad de pixeles) para que el trazo no salga borroso ni desplazado.
    // Se observa el propio canvas: puede montarse oculto (paso del formulario no visible) y medir 0x0 hasta que aparece.
    const fit = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1)
      const { width, height } = el.getBoundingClientRect()
      if (!width || !height) return
      const keep = p.isEmpty() ? null : p.toData()
      el.width = Math.round(width * ratio)
      el.height = Math.round(height * ratio)
      el.getContext('2d')?.scale(ratio, ratio)
      p.clear()
      if (keep) p.fromData(keep)
    }
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    const end = () => change.current(p.isEmpty() ? '' : p.toDataURL('image/png'))
    p.addEventListener('endStroke', end)
    return () => {
      observer.disconnect()
      p.removeEventListener('endStroke', end)
      p.off()
    }
  }, [])

  return (
    <div>
      <canvas
        ref={canvas}
        role="img"
        aria-label="Espacio para dibujar tu firma con el dedo o el mouse"
        aria-describedby={describedBy}
        className={`h-40 w-full touch-none rounded-xl border ${invalid ? 'border-bad' : 'border-white/20'}`}
      />
      <button
        type="button"
        className="btn btn-ghost mt-1 text-xs"
        onClick={() => {
          pad.current?.clear()
          change.current('')
        }}
      >
        Borrar y volver a firmar
      </button>
    </div>
  )
}
