import { requireCapability } from '@/server/auth/guards'
import { DentalAtlas } from '@/components/dental-atlas'

export const metadata = { title: 'Modelo dental 3D · Alquimia Dental' }

export default async function DientesPage() {
  await requireCapability('encounters.read')
  return (
    <div className="fade-in space-y-5">
      <div>
        <p className="eyebrow">Herramienta para odontólogos</p>
        <h1 className="title-gold mt-1 text-3xl">Modelo dental 3D</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">Elige la atención del paciente, toca un diente y registra su estado aquí mismo. También puedes mostrar raíces, nervios y vasos para explicar el tratamiento.</p>
      </div>
      <section className="glass p-4 sm:p-6"><DentalAtlas /></section>
    </div>
  )
}
