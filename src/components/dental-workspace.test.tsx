// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DentalWorkspace } from './dental-workspace'
import type { DentalRenderProps } from './dental-render'
import type { Dentition } from '@/lib/teeth'
import type { ToothMark } from './odontogram'
import type { DentalEditingProps } from './dental-finding-editor'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
})

vi.mock('./dental-render', () => ({
  DentalRender: ({ selected, onSelect, dentition }: DentalRenderProps) => (
    <div>
      <output aria-label="Selección 3D">
        {selected ?? 'ninguna'} · {dentition}
      </output>
      <button onClick={() => onSelect?.(21)}>Seleccionar 21 en 3D</button>
    </div>
  ),
}))
afterEach(cleanup)

function Harness() {
  const [selected, setSelected] = useState<number | undefined>(16)
  const [dentition, setDentition] = useState<Dentition>('permanente')
  return <DentalWorkspace marks={{}} selected={selected} onSelect={setSelected} dentition={dentition} onDentitionChange={setDentition} />
}

describe('Flujo dental compartido por consulta e historial', () => {
  it('mantiene sincronizadas la selección del modelo y la del mapa', async () => {
    render(<Harness />)
    expect(screen.queryByLabelText('Selección 3D')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Boca 3D' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Seleccionar 21 en 3D' }))
    expect(screen.getByRole('button', { name: /pieza 21:/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /pieza 46:/ }))
    expect(screen.getByLabelText('Selección 3D').textContent).toBe('46 · permanente')
  })

  it('limpia la pieza al cambiar de dentición y no recupera una selección oculta', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Boca 3D' }))
    await screen.findByLabelText('Selección 3D')
    fireEvent.click(screen.getByRole('button', { name: 'Infantiles' }))
    expect(screen.getByLabelText('Selección 3D').textContent).toBe('ninguna · temporal')
    expect((screen.getByRole('button', { name: 'Boca 3D' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /pieza 51:/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Adultos' }))
    expect(screen.getByLabelText('Selección 3D').textContent).toBe('ninguna · permanente')
    expect(screen.getByRole('button', { name: /pieza 16:/ }).getAttribute('aria-pressed')).toBe('false')
  })
})

function EditableHarness({ onSave }: { onSave: NonNullable<DentalEditingProps['onMark']> }) {
  const [selected, setSelected] = useState<number>()
  const [dentition, setDentition] = useState<Dentition>('permanente')
  const [marks, setMarks] = useState<Record<number, ToothMark>>({})
  return (
    <DentalWorkspace
      marks={marks}
      selected={selected}
      onSelect={setSelected}
      dentition={dentition}
      onDentitionChange={setDentition}
      onMark={async (tooth, condition) => {
        const error = await onSave(tooth, condition)
        if (!error) setMarks((current) => ({ ...current, [tooth]: { condition, today: true } }))
        return error
      }}
      onClear={(tooth) => {
        setMarks((current) => {
          const next = { ...current }
          delete next[tooth]
          return next
        })
        return undefined
      }}
    />
  )
}

describe('Marcación directa desde el diente', () => {
  it('abre opciones al tocar un diente, guarda el hallazgo en esa pieza y permite quitarlo', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(<EditableHarness onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: /pieza 16:/ }))
    const editor = await screen.findByRole('region', { name: 'Estado del diente' })
    expect(within(editor).getByRole('heading', { name: /Primer molar superior derecho/ })).toBeTruthy()
    fireEvent.click(within(editor).getByRole('button', { name: 'Caries' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Estado del diente' })).toBeTruthy())
    expect(save).toHaveBeenCalledExactlyOnceWith(16, 'caries')
    expect(screen.getByRole('button', { name: /pieza 16: Caries/ })).toBeTruthy()
    await screen.findByText('Estado guardado: Caries · pieza 16')
    await waitFor(() => expect((screen.getByRole('button', { name: 'Caries' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /pieza 16: Caries/ }))
    fireEvent.click(within(screen.getByRole('region', { name: 'Estado del diente' })).getByRole('button', { name: 'Quitar marca de hoy' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Estado del diente' })).toBeTruthy())
    await waitFor(() => expect(screen.getByRole('button', { name: /pieza 16: sin hallazgos/ })).toBeTruthy())
  })

  it('revierte el color y conserva el editor con un error si el servidor rechaza el cambio', async () => {
    render(<EditableHarness onSave={async () => 'La atención ya está cerrada.'} />)
    fireEvent.click(screen.getByRole('button', { name: /pieza 21:/ }))
    fireEvent.click(within(await screen.findByRole('region', { name: 'Estado del diente' })).getByRole('button', { name: 'Roto / fracturado' }))
    await screen.findByText('La atención ya está cerrada.')
    expect(screen.getByRole('region', { name: 'Estado del diente' })).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('button', { name: /pieza 21: sin hallazgos/ })).toBeTruthy())
    expect(screen.queryByText('Estado guardado: Fractura · pieza 21')).toBeNull()
  })

  it('también abre el editor al seleccionar en 3D y permite salir sin guardar', async () => {
    const save = vi.fn()
    render(<EditableHarness onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: 'Boca 3D' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Seleccionar 21 en 3D' }))
    const editor = await screen.findByRole('region', { name: 'Estado del diente' })
    expect(within(editor).getByText(/Arriba izquierda · pieza 21/)).toBeTruthy()
    fireEvent.click(within(editor).getByRole('button', { name: 'Cerrar selección de hallazgo' }))
    expect(screen.getByText('Elige un diente')).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
  })

  it('el modo paciente permite explorar sin abrir el editor ni guardar cambios', async () => {
    const save = vi.fn()
    render(<EditableHarness onSave={save} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar al paciente' }))
    const presentation = await screen.findByRole('dialog')
    fireEvent.click(await within(presentation).findByRole('button', { name: 'Seleccionar 21 en 3D' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(within(presentation).queryByRole('button', { name: 'Caries' })).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })
})
