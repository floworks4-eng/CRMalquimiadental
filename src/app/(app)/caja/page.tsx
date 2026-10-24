import { CajaView } from '@/components/caja/caja-view'
import { requireCapability } from '@/server/auth/guards'
import { can } from '@/server/auth/permissions'
import { getCashDay } from '@/server/queries/billing'
import { todayLaPaz } from '@/lib/domain/time'

export const metadata = { title: 'Caja · Alquimia Dental' }

export default async function CajaPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const s = await requireCapability('cash.read')
  const { date } = await searchParams
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayLaPaz() ? date : todayLaPaz()
  return <CajaView day={await getCashDay(day)} canVoid={can(s.member.role, 'billing.void')} />
}
