import { notFound } from 'next/navigation'
import { ConsultaView } from '@/components/consulta/consulta-view'
import { requireCapability } from '@/server/auth/guards'
import { getConsulta } from '@/server/queries/clinical'

export const metadata = { title: 'Atención · Alquimia Dental' }

export default async function AtencionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapability('encounters.read')
  const { id } = await params
  const data = await getConsulta(id)
  if (!data) notFound() // igual si no existe o si es de otro odontólogo
  return <ConsultaView data={data} />
}
