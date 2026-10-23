'use client'
import { useState, useTransition } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import type { ActionResult } from '@/server/errors'

type Run = (values: Record<string, string>) => Promise<ActionResult<unknown> | void>

/**
 * react-hook-form + zod (cliente) + Server Action. Valida en el navegador para dar feedback inmediato; el servidor
 * vuelve a validar con el mismo esquema. A la accion se le pasan los valores tal cual se escribieron.
 * Si la accion redirige, no vuelve.
 */
export function useActionForm<T extends z.ZodObject>(schema: T, run: Run, defaultValues?: Record<string, string>) {
  const form: UseFormReturn<Record<string, string>> = useForm<Record<string, string>>({ resolver: zodResolver(schema as never) as never, defaultValues })
  const [pending, start] = useTransition()
  const [formError, setFormError] = useState('')
  const [done, setDone] = useState(false)
  const submit = form.handleSubmit(() => {
    setFormError('')
    start(async () => {
      const r = await run(form.getValues())
      if (!r) return
      if (r.ok) return setDone(true)
      for (const [k, msg] of Object.entries(r.error.fields ?? {})) form.setError(k, { message: msg })
      if (!r.error.fields) setFormError(r.error.message)
    })
  })
  return { form, submit, pending, formError, done }
}
