'use client'
import { Field } from './ui'
import { useActionForm } from './use-action-form'
import { newPasswordSchema, resetRequestSchema, setupSchema, signInSchema } from '@/server/schemas/auth'
import { requestPasswordReset, signIn, updatePassword } from '@/server/actions/auth'
import { setupClinic } from '@/server/actions/setup'

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

export function SetupForm() {
  const { form, submit, pending, formError } = useActionForm(setupSchema, setupClinic)
  const e = form.formState.errors
  const input = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <Field label={label} error={e[name]?.message} hint={hint}>
      {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!e[name]} className="field" {...props} {...form.register(name)} />}
    </Field>
  )
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {input('fullName', 'Tu nombre completo', { autoComplete: 'name' })}
      {input('email', 'Tu correo', { type: 'email', autoComplete: 'username' })}
      {input('password', 'Contraseña', { type: 'password', autoComplete: 'new-password' }, 'Mínimo 12 caracteres.')}
      {input('confirm', 'Repite la contraseña', { type: 'password', autoComplete: 'new-password' })}
      <FormError message={formError} />
      <Submit pending={pending}>Crear mi cuenta y entrar</Submit>
    </form>
  )
}
