'use client'

import Link from 'next/link'
import { useState } from 'react'
import { DentalWorkspace } from '@/components/dental-workspace'
import type { ToothMark } from '@/components/odontogram'
import { dentitionForTooth, type Dentition } from '@/lib/teeth'

const previewMarks: Record<number, ToothMark> = {
  11: { condition: 'corona', today: false },
  16: { condition: 'caries', today: true },
  21: { condition: 'endodoncia', today: false },
  26: { condition: 'sellante', today: true },
  36: { condition: 'implante', today: false },
  46: { condition: 'fractura', today: false },
  47: { condition: 'ausente', today: false },
}

export default function DentalPreviewPage() {
  const [selected, setSelected] = useState<number | undefined>()
  const [marks, setMarks] = useState(previewMarks)
  const [dentition, setDentition] = useState<Dentition>('permanente')

  const handleSelectTooth = (tooth: number | undefined) => {
    setSelected(tooth)
    if (tooth !== undefined) {
      setDentition(dentitionForTooth(tooth))
    }
  }

  return (
    <main className="min-h-dvh px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto max-w-[1220px]">
        <Link href="/login" className="btn btn-ghost -ml-3 mb-5 text-xs">
          ← Volver al acceso
        </Link>
        <div className="mb-6 max-w-2xl">
          <p className="eyebrow mb-2">Preview local · datos ficticios</p>
          <h1 className="title-gold text-3xl md:text-5xl">Odontograma interactivo</h1>
          <p className="mt-3 text-sm leading-6 text-muted md:text-base">
            Toca un diente y marca caries, fractura u otro hallazgo. Los cambios de esta demo son de prueba y se reinician al recargar.
          </p>
        </div>

        <section className="glass p-4 sm:p-6">
          <DentalWorkspace
            temporary
            initialView="3d"
            marks={marks}
            selected={selected}
            onSelect={handleSelectTooth}
            dentition={dentition}
            onDentitionChange={setDentition}
            onMark={(tooth, condition) => {
              setMarks((current) => ({ ...current, [tooth]: { condition, today: true } }))
              return undefined
            }}
            onClear={(tooth) => {
              setMarks((current) => {
                const next = { ...current }
                if (previewMarks[tooth] && !previewMarks[tooth].today) next[tooth] = previewMarks[tooth]
                else delete next[tooth]
                return next
              })
              return undefined
            }}
          />
        </section>
      </div>
    </main>
  )
}
