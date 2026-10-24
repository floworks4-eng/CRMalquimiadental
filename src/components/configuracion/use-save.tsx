'use client'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { ActionResult } from '@/server/errors'

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/** Accion con estado de envio, error y aviso de guardado. Recarga los datos al terminar bien. */
export function useSave() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) => start(async () => {
    setError('')
    setFields({})
    setSaved(false)
    const r = await fn()
    if (!r.ok) {
      setError(r.error.message)
      return setFields(r.error.fields ?? {})
    }
    setSaved(true)
    after?.()
    router.refresh()
  })
  const status = (
    <>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      {saved && !error && <p role="status" className="text-sm text-ok">Guardado.</p>}
    </>
  )
  return { pending, error, fields, run, status }
}

