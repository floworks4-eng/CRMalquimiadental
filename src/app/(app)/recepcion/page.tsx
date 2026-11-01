import { redirect } from 'next/navigation'

export default async function Recepcion({ searchParams }: { searchParams: Promise<{ cita?: string }> }) {
  const { cita } = await searchParams
  redirect(cita ? `/agenda?recibir=${encodeURIComponent(cita)}` : '/agenda?vista=pendientes')
}
