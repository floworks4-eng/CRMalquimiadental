import { redirect } from 'next/navigation'
import { requireCapability } from '@/server/auth/guards'
import { isCalendarDate } from '@/lib/domain/calendar'

export default async function ConsultaPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireCapability('encounters.read')
  const { date } = await searchParams
  redirect(`/agenda?view=list&vista=espera${date && isCalendarDate(date) ? `&date=${date}` : ''}`)
}
