import { AgendaBoard } from '@/components/agenda/agenda-board'
import { getDayBoard } from '@/server/queries/agenda'
import { requireMember } from '@/server/auth/guards'
import { can } from '@/server/auth/permissions'
import { redirect } from 'next/navigation'
import { todayLaPaz } from '@/lib/domain/time'

export const metadata = { title: 'Agenda · Alquimia Dental' }

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const s = await requireMember()
  if (!can(s.member.role, 'agenda.read_all') && !can(s.member.role, 'agenda.read_own')) redirect('/forbidden')
  const { date } = await searchParams
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayLaPaz()
  return <AgendaBoard board={await getDayBoard(day)} role={s.member.role} />
}
