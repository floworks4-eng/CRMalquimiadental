// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Odontogram, type ToothMark } from './odontogram'
import type { Dentition } from '@/lib/teeth'
import { CONDITIONS, CONDITION_LABEL } from '@/lib/domain/clinical'
import { DentalTooth } from './dental-tooth'

afterEach(() => {
  cleanup()
})

const sampleMarks: Record<number, ToothMark> = {
  16: { condition: 'caries', today: true },
  21: { condition: 'endodoncia', today: false },
}

describe('Odontogram visual', () => {
  it('muestra las 4 zonas, botones compactos y hallazgos con nombres accesibles', () => {
    const onSelect = vi.fn()
    render(<Odontogram marks={sampleMarks} selected={16} onSelect={onSelect} />)

    expect(screen.getByText('Arriba derecha')).toBeTruthy()
    expect(screen.getByText('Arriba izquierda')).toBeTruthy()
    expect(screen.getByText('Abajo derecha')).toBeTruthy()
    expect(screen.getByText('Abajo izquierda')).toBeTruthy()
    expect(screen.getByText(/derecha e izquierda del paciente/i)).toBeTruthy()
    expect(screen.queryByText(/Toca un diente/)).toBeNull()
    expect(within(screen.getByRole('status')).getByText('Primer molar superior derecho')).toBeTruthy()
    expect(within(screen.getByRole('status')).getByText('FDI 16')).toBeTruthy()
    expect(within(screen.getByRole('status')).getByText('Caries · hoy')).toBeTruthy()

    const btn21 = screen.getByRole('button', {
      name: /Diente central · Arriba izquierda · pieza 21: Endodoncia/i,
    })
    expect(within(btn21).queryByText('Diente central')).toBeNull()
    expect(btn21.textContent).toBe('FDI 21')
    expect(btn21.title).toContain('Incisivo central superior izquierdo · pieza 21')
    expect(btn21.title).toContain('Endodoncia (previo)')
    expect(btn21.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(btn21.querySelector('svg')?.getAttribute('focusable')).toBe('false')
    expect(btn21.getAttribute('type')).toBe('button')
    expect(btn21.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: /pieza 16: Caries \(hoy\)/i }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(btn21)
    expect(onSelect).toHaveBeenCalledWith(21)
    expect(onSelect).toHaveBeenCalledTimes(1)
    // El padre conserva el control hasta que envía la nueva selección.
    expect(btn21.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: /pieza 16:/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('incluye las 32 piezas adultas en sus zonas y conserva la orientación clínica', () => {
    render(<Odontogram marks={{}} onSelect={vi.fn()} />)

    const zones = [
      ['Arriba derecha', [18, 17, 16, 15, 14, 13, 12, 11]],
      ['Arriba izquierda', [21, 22, 23, 24, 25, 26, 27, 28]],
      ['Abajo derecha', [48, 47, 46, 45, 44, 43, 42, 41]],
      ['Abajo izquierda', [31, 32, 33, 34, 35, 36, 37, 38]],
    ] as const
    for (const [zone, teeth] of zones) {
      const buttons = within(screen.getByRole('group', { name: new RegExp(`^${zone} \\(`) })).getAllByRole('button')
      expect(buttons.map((button) => button.textContent?.match(/FDI (\d+)/)?.[1])).toEqual(teeth.map(String))
    }
    expect(screen.getByRole('button', { name: 'Adultos' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: /desplazar/i })).toBeNull()
    expect(screen.queryByText(/desliza/i)).toBeNull()
    expect(screen.queryByText('2D')).toBeNull()
  })

  it('mantiene FDI opcional y una leyenda visible con los mismos símbolos del mapa', () => {
    render(<Odontogram marks={{}} onSelect={vi.fn()} />)

    const summary = screen.getByText('¿Qué significa FDI?')
    const details = summary.closest('details')!
    expect(summary.tagName).toBe('SUMMARY')
    expect(details.open).toBe(false)
    fireEvent.click(summary)
    expect(details.open).toBe(true)
    fireEvent.click(summary)
    expect(details.open).toBe(false)
    const legend = screen.getByRole('list', { name: 'Leyenda' })
    expect(legend.closest('details')).toBeNull()
    expect(legend.children).toHaveLength(10)
    for (const condition of CONDITIONS) {
      expect(within(legend).getByText(CONDITION_LABEL[condition]).querySelector('svg')?.getAttribute('data-condition')).toBe(condition)
    }
  })

  it('cambia a las 20 piezas infantiles, oculta la selección desfasada y avisa al padre', () => {
    const onSelect = vi.fn()
    const onDentitionChange = vi.fn()
    render(<Odontogram marks={sampleMarks} selected={16} onSelect={onSelect} onDentitionChange={onDentitionChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Infantiles' }))
    expect(onDentitionChange).toHaveBeenCalledExactlyOnceWith('temporal')
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByText('Dientes de leche')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('')
    expect(screen.queryByRole('button', { name: /pieza 16:/ })).toBeNull()
    const teeth = screen.getAllByRole('button', { name: /pieza \d+:/ })
    expect(teeth).toHaveLength(20)
    expect(teeth.every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(teeth.map((button) => Number(button.textContent?.match(/FDI (\d+)/)?.[1])).sort()).toEqual([
      51, 52, 53, 54, 55, 61, 62, 63, 64, 65, 71, 72, 73, 74, 75, 81, 82, 83, 84, 85,
    ])
    const zones = [
      ['Arriba derecha', [55, 54, 53, 52, 51]],
      ['Arriba izquierda', [61, 62, 63, 64, 65]],
      ['Abajo derecha', [85, 84, 83, 82, 81]],
      ['Abajo izquierda', [71, 72, 73, 74, 75]],
    ] as const
    for (const [zone, numbers] of zones) {
      const buttons = within(screen.getByRole('group', { name: new RegExp(`^${zone} \\(`) })).getAllByRole('button')
      expect(buttons.map((button) => Number(button.textContent?.match(/FDI (\d+)/)?.[1]))).toEqual(numbers)
    }

    fireEvent.click(screen.getByRole('button', { name: /Muela 1 · Arriba derecha · pieza 54: sin hallazgos/i }))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(54)
  })

  it('permite al padre limpiar con onSelect(undefined) y evita recuperar selecciones anteriores al volver de dentición', () => {
    const onParentSelect = vi.fn()
    const onToothSelect = vi.fn()
    function Parent() {
      const [dentition, setDentition] = useState<Dentition>('permanente')
      const [selected, setSelected] = useState<number | undefined>(16)
      const selectTooth = (n: number | undefined) => {
        onParentSelect(n)
        setSelected(n)
      }
      return (
        <Odontogram
          marks={sampleMarks}
          selected={selected}
          dentition={dentition}
          onSelect={(n) => {
            onToothSelect(n)
            selectTooth(n)
          }}
          onDentitionChange={(next) => {
            selectTooth(undefined)
            setDentition(next)
          }}
        />
      )
    }
    render(<Parent />)

    fireEvent.click(screen.getByRole('button', { name: 'Infantiles' }))
    expect(onParentSelect).toHaveBeenLastCalledWith(undefined)
    expect(onToothSelect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /pieza 51:/ }))
    expect(within(screen.getByRole('status')).getByText('FDI 51')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Adultos' }))
    expect(screen.getByRole('status').textContent).toBe('')
    expect(screen.getByRole('button', { name: /pieza 16:/ }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Infantiles' }))
    expect(screen.getByRole('button', { name: /pieza 51:/ }).getAttribute('aria-pressed')).toBe('false')
    expect(onToothSelect).toHaveBeenCalledExactlyOnceWith(51)
    expect(onParentSelect.mock.calls).toEqual([[undefined], [51], [undefined], [undefined]])
  })

  it('respeta la dentición controlada hasta que el padre la actualiza', () => {
    const onDentitionChange = vi.fn()
    const props = { marks: sampleMarks, selected: 16, onSelect: vi.fn(), onDentitionChange }
    const { rerender } = render(<Odontogram {...props} dentition="permanente" />)

    fireEvent.click(screen.getByRole('button', { name: 'Infantiles' }))
    expect(onDentitionChange).toHaveBeenCalledExactlyOnceWith('temporal')
    expect(screen.getByRole('button', { name: 'Adultos' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(screen.getByRole('status')).getByText('FDI 16')).toBeTruthy()

    rerender(<Odontogram {...props} dentition="temporal" />)
    expect(screen.getByRole('button', { name: 'Infantiles' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('status').textContent).toBe('')
    expect(onDentitionChange).toHaveBeenCalledTimes(1)
  })

  it('inicia con la dentición de la pieza seleccionada y muestra hallazgos infantiles previos', () => {
    render(<Odontogram marks={{ 54: { condition: 'corona', today: false } }} selected={54} onSelect={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Infantiles' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Muela 1 · Arriba derecha · pieza 54: Corona/i }).getAttribute('aria-pressed')).toBe('true')
    expect(within(screen.getByRole('status')).getByText('Corona · previo')).toBeTruthy()
  })

  it('respeta initialDentition sin selección y no notifica al pulsar la dentición activa', () => {
    const onDentitionChange = vi.fn()
    render(<Odontogram marks={{}} initialDentition="temporal" onSelect={vi.fn()} onDentitionChange={onDentitionChange} />)

    const infants = screen.getByRole('button', { name: 'Infantiles' })
    expect(infants.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(infants)
    expect(onDentitionChange).not.toHaveBeenCalled()
  })

  it('refleja los cambios de selección y hallazgos que recibe del padre', () => {
    const props = { marks: sampleMarks, onSelect: vi.fn() }
    const { rerender } = render(<Odontogram {...props} selected={16} />)

    rerender(<Odontogram {...props} selected={21} />)
    expect(screen.getByRole('button', { name: /pieza 16:/ }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: /pieza 21:/ }).getAttribute('aria-pressed')).toBe('true')
    expect(within(screen.getByRole('status')).getByText('Endodoncia · previo')).toBeTruthy()

    rerender(<Odontogram {...props} selected={18} />)
    expect(within(screen.getByRole('status')).getByText('Tercer molar superior derecho')).toBeTruthy()
    expect(within(screen.getByRole('status')).getByText('Sin hallazgos registrados')).toBeTruthy()

    rerender(<Odontogram {...props} />)
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('expone todos los hallazgos y el estado hoy/previo sin depender del color', () => {
    const numbers = [11, 12, 13, 14, 15, 16, 17, 18, 21]
    const marks = Object.fromEntries(CONDITIONS.map((condition, i) => [numbers[i], { condition, today: i % 2 === 0 }]))
    render(<Odontogram marks={marks} selected={13} onSelect={vi.fn()} />)

    CONDITIONS.forEach((condition, i) => {
      const button = screen.getByRole('button', { name: new RegExp(`pieza ${numbers[i]}: ${CONDITION_LABEL[condition]}`) })
      expect(button.getAttribute('aria-label')?.includes('(hoy)')).toBe(i % 2 === 0)
      expect(button.querySelector('svg')?.getAttribute('data-condition')).toBe(condition)
      expect(button.getAttribute('aria-pressed')).toBe(String(numbers[i] === 13))
    })
    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.getAttribute('aria-atomic')).toBe('true')
  })
})

describe('DentalTooth reutilizable en mapa y mosaicos', () => {
  it('diferencia las cuatro familias y reconoce los molares temporales', () => {
    const { container } = render(
      <>
        {[11, 13, 14, 16, 54].map((tooth) => (
          <DentalTooth key={tooth} tooth={tooth} />
        ))}
      </>,
    )
    const glyphs = Array.from(container.querySelectorAll('svg'))
    expect(glyphs.map((glyph) => glyph.getAttribute('data-kind'))).toEqual(['incisivo', 'canino', 'premolar', 'molar', 'molar'])
    // Cada familia tiene silueta propia, no solo otra etiqueta o color.
    expect(new Set(glyphs.slice(0, 4).map((glyph) => glyph.querySelector('path')?.getAttribute('d'))).size).toBe(4)
  })

  it('orienta las raíces según la arcada y permite sobrescribirla en mosaicos', () => {
    const { container, rerender } = render(<DentalTooth tooth={11} />)
    expect(container.querySelector('svg > g')?.getAttribute('transform')).toBe('translate(0 72) scale(1 -1)')
    rerender(<DentalTooth tooth={41} />)
    expect(container.querySelector('svg > g')?.getAttribute('transform')).toBeNull()
    rerender(<DentalTooth tooth={11} upper={false} />)
    expect(container.querySelector('svg')?.getAttribute('data-upper')).toBe('false')
    rerender(<DentalTooth tooth={41} upper />)
    expect(container.querySelector('svg')?.getAttribute('data-upper')).toBe('true')
  })

  it('ofrece nueve símbolos vectoriales distintos y admite props opcionales', () => {
    const { container, rerender } = render(<DentalTooth className="preview-tooth" />)
    expect(container.querySelector('svg')?.classList.contains('preview-tooth')).toBe(true)
    expect(container.querySelector('svg')?.getAttribute('data-kind')).toBe('molar')
    const drawings = CONDITIONS.map((condition) => {
      rerender(<DentalTooth tooth={16} condition={condition} selected />)
      const glyph = container.querySelector('svg')!
      expect(glyph.querySelector('image, text, foreignObject')).toBeNull()
      expect(glyph.querySelector('[stroke="#d7b56d"]')).toBeTruthy()
      return glyph.innerHTML
    })
    expect(new Set(drawings).size).toBe(CONDITIONS.length)
  })
})
