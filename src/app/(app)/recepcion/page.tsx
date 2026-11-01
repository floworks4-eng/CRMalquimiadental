import { redirect } from 'next/navigation'
import { requireCapability } from '@/server/auth/guards'

export default async function RecepcionPage() {
  await requireCapability('reception.board')
  redirect('/agenda?view=list&vista=pendientes')
}
