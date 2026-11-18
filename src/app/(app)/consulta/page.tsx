import Link from 'next/link'
import { ActiveCareQueue } from '@/components/agenda/care-flow-board'
import { PageHeader } from '@/components/ui'
import { requireCapability } from '@/server/auth/guards'
import { getDayBoard } from '@/server/queries/agenda'
import { isCalendarDate } from '@/lib/domain/calendar'
import { formatDayLong, todayLaPaz } from '@/lib/domain/time'

export const metadata = { title: 'Consulta · Alquimia Dental' }

export default async function ConsultaPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const s = await requireCapability('encounters.read')
  const { date } = await searchParams
  const day = date && isCalendarDate(date) ? date : todayLaPaz()
  const board = await getDayBoard(day)
  const active = board.appointments.filter((a) => a.status === 'checked_in' || a.status === 'in_progress')
  return (
    <div className="fade-in">
      <PageHeader title="Consulta" eyebrow={formatDayLong(day)}>
        <Link href={`/agenda?date=${day}`} className="btn btn-secondary">Ver agenda</Link>
      </PageHeader>
      <ActiveCareQueue key={day} appointments={active} role={s.member.role} userId={s.userId} />
    </div>
  )
}
