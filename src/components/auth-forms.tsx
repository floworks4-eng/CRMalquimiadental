'use client'
import { useEffect, useState } from 'react'
import { Field } from './ui'
import { useActionForm } from './use-action-form'
import { acceptInviteSchema, mfaVerifySchema, newPasswordSchema, resetRequestSchema, signInSchema } from '@/server/schemas/auth'
import { requestPasswordReset, signIn, startMfaEnroll, confirmMfaEnroll, updatePassword, verifyMfa } from '@/server/actions/auth'
import { acceptInvite } from '@/server/actions/members'

const Submit = ({ pending, children }: { pending: boolean; children: string }) => (
  <button className="btn btn-primary w-full" disabled={pending}>{pending ? 'Un momento…' : children}</button>
)
const FormError = ({ message }: { message: string }) =>
  message ? <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{message}</p> : null

export function LoginForm() {
  const { form, submit, pending, formError } = useActionForm(signInSchema, signIn)
  const e = form.formState.errors
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Correo" error={e.email?.message}>
        {(id, d) => <input id={id} type="email" autoComplete="username" aria-describedby={d} aria-invalid={!!e.email} className="field" {...form.register('email')} />}
      </Field>
      <Field label="Contraseña" error={e.password?.message}>
        {(id, d) => <input id={id} type="password" autoComplete="current-password" aria-describedby={d} aria-invalid={!!e.password} className="field" {...form.register('password')} />}
      </Field>
      <FormError message={formError} />
      <Submit pending={pending}>Ingresar</Submit>
    </form>
  )
}

export function ResetRequestForm() {
  const { form, submit, pending, formError, done } = useActionForm(resetRequestSchema, requestPasswordReset)
  const e = form.formState.errors
  if (done) return <p role="status" className="text-sm text-bone">Si el correo está registrado, te enviamos un enlace para crear una contraseña nueva.</p>
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Correo" error={e.email?.message}>
        {(id, d) => <input id={id} type="email" autoComplete="username" aria-describedby={d} aria-invalid={!!e.email} className="field" {...form.register('email')} />}
      </Field>
      <FormError message={formError} />
      <Submit pending={pending}>Enviar enlace</Submit>
    </form>
  )
}

export function NewPasswordForm() {
  const { form, submit, pending, formError } = useActionForm(newPasswordSchema, updatePassword)
  const e = form.formState.errors
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Contraseña nueva" error={e.password?.message} hint="Mínimo 12 caracteres.">
        {(id, d) => <input id={id} type="password" autoComplete="new-password" aria-describedby={d} aria-invalid={!!e.password} className="field" {...form.register('password')} />}
      </Field>
      <FormError message={formError} />
      <Submit pending={pending}>Guardar contraseña</Submit>
    </form>
  )
}

export function MfaVerifyForm() {
  const { form, submit, pending, formError } = useActionForm(mfaVerifySchema, verifyMfa)
  const e = form.formState.errors
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Código de tu app de autenticación" error={e.code?.message}>
        {(id, d) => <input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-describedby={d} aria-invalid={!!e.code} className="field num text-center text-xl tracking-[0.4em]" {...form.register('code')} />}
      </Field>
      <FormError message={formError} />
      <Submit pending={pending}>Verificar</Submit>
    </form>
  )
}

export function MfaEnrollForm() {
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let stale = false
    startMfaEnroll().then((r) => {
      if (stale) return
      if (r.ok) setEnroll(r.data)
      else setError(r.error.message)
    })
    return () => {
      stale = true
    }
  }, [])
  const { form, submit, pending, formError } = useActionForm(mfaVerifySchema, (v) => confirmMfaEnroll({ factorId: enroll?.factorId, code: v.code }))
  const e = form.formState.errors
  if (error) return <p role="alert" className="text-sm text-bad">{error}</p>
  if (!enroll) return <p className="text-sm text-muted" aria-busy="true">Preparando tu código…</p>
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Abre una app de autenticación (Google Authenticator, Authy, 1Password…).</li>
        <li>Escanea el código o escribe la clave manualmente.</li>
        <li>Escribe el código de 6 dígitos que te muestra.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- data URI generado por Supabase */}
      <img src={enroll.qr} alt="Código QR para configurar la verificación en dos pasos" className="mx-auto h-44 w-44 rounded-xl bg-white p-2" />
      <p className="text-center text-xs text-muted">Clave manual: <code className="num text-bone">{enroll.secret}</code></p>
      <Field label="Código de 6 dígitos" error={e.code?.message}>
        {(id, d) => <input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-describedby={d} aria-invalid={!!e.code} className="field num text-center text-xl tracking-[0.4em]" {...form.register('code')} />}
      </Field>
      <FormError message={formError} />
      <Submit pending={pending}>Activar y entrar</Submit>
    </form>
  )
}

export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const schema = acceptInviteSchema.pick({ fullName: true, password: true })
  const { form, submit, pending, formError } = useActionForm(schema, (v) => acceptInvite({ ...v, token }))
  const e = form.formState.errors
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-muted">Tu correo: <span className="text-bone">{email}</span></p>
      <Field label="Nombre completo" error={e.fullName?.message}>
        {(id, d) => <input id={id} autoComplete="name" aria-describedby={d} aria-invalid={!!e.fullName} className="field" {...form.register('fullName')} />}
      </Field>
      <Field label="Contraseña" error={e.password?.message} hint="Mínimo 12 caracteres.">
        {(id, d) => <input id={id} type="password" autoComplete="new-password" aria-describedby={d} aria-invalid={!!e.password} className="field" {...form.register('password')} />}
      </Field>
      <FormError message={formError} />
      <Submit pending={pending}>Crear mi cuenta</Submit>
    </form>
  )
}
