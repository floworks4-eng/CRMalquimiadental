import { ReceptionBoard } from '@/components/agenda/reception-board'
import { getDayBoard } from '@/server/queries/agenda'
import { requireCapability } from '@/server/auth/guards'
import { todayLaPaz } from '@/lib/domain/time'

export const metadata = { title: 'Recepción · Alquimia Dental' }

export default async function RecepcionPage() {
  const s = await requireCapability('reception.board')
  const date = todayLaPaz()
  const board = await getDayBoard(date)
  return <ReceptionBoard date={date} appointments={board.appointments} role={s.member.role} />
}
