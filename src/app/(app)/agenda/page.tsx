import { AgendaBoard } from '@/components/agenda/agenda-board'
import { getCalendarBoard } from '@/server/queries/agenda'
import { requireMember } from '@/server/auth/guards'
import { can } from '@/server/auth/permissions'
import { redirect } from 'next/navigation'
import { todayLaPaz } from '@/lib/domain/time'
import { isCalendarDate, type AgendaView } from '@/lib/domain/calendar'

export const metadata = { title: 'Agenda · Alquimia Dental' }

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; vista?: string; cita?: string; nueva?: string }>
}) {
  const s = await requireMember()
  if (!can(s.member.role, 'agenda.read_all') && !can(s.member.role, 'agenda.read_own')) redirect('/forbidden')
  const params = await searchParams
  const day = params.date && isCalendarDate(params.date) ? params.date : todayLaPaz()
  const filter = ['pendientes', 'espera', 'atencion', 'atendidas'].includes(params.vista ?? '') ? params.vista! : 'todas'
  const view: AgendaView =
    filter !== 'todas' ? 'list' : ['day', 'week', 'month', 'list'].includes(params.view ?? '') ? (params.view as AgendaView) : 'day'
  return (
    <AgendaBoard
      board={await getCalendarBoard(day, view)}
      role={s.member.role}
      userId={s.userId}
      view={view}
      filter={filter}
      selectedId={params.cita}
      createInitially={params.nueva === '1'}
    />
  )
}
