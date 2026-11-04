'use client'

import { useState } from 'react'
import { DentalWorkspace } from './dental-workspace'
import type { Dentition } from '@/lib/teeth'

/** Explorador independiente: no lee ni modifica datos de pacientes. */
export function DentalAtlas() {
  const [selected, setSelected] = useState<number>()
  const [dentition, setDentition] = useState<Dentition>('permanente')
  return <DentalWorkspace marks={{}} selected={selected} onSelect={setSelected} dentition={dentition} onDentitionChange={setDentition} initialView="3d" />
}
