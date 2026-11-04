// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ConsultaView } from './consulta-view'
import type { ConsultaData } from '@/server/queries/clinical'

const actions = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: actions.refresh }) }))
vi.mock('@/server/actions/clinical', () => ({
  addFinding: actions.add,
  removeFinding: actions.remove,
  addAddendum: vi.fn(),
  addPlanItem: vi.fn(),
  finishEncounter: vi.fn(),
  removePlanItem: vi.fn(),
  saveEncounterNotes: vi.fn(),
  setPlanItemToday: vi.fn(),
  startEncounter: vi.fn(),
}))
vi.mock('../dental-render', () => ({ DentalRender: () => <div>Modelo 3D</div> }))

const data: ConsultaData = {
  appointment: {
    id: 'appointment',
    startsAt: '2026-11-01T14:00:00Z',
    endsAt: '2026-11-01T15:00:00Z',
    status: 'in_progress',
    source: 'phone',
    notes: null,
    cancellationReason: null,
    checkedInAt: null,
    updatedAt: '2026-11-01T14:00:00Z',
    patient: { id: 'patient', fullName: 'Paciente de prueba' },
    dentist: { id: 'dentist', fullName: 'Odontólogo' },
    cabinet: { id: 'cabinet', name: 'Consultorio' },
    treatment: null,
    campaignName: null,
  },
  patient: { id: 'patient', fullName: 'Paciente de prueba', birthDate: '1990-01-01', phone: null },
  encounter: {
    id: 'encounter',
    status: 'in_progress',
    chiefComplaint: null,
    notes: null,
    startedAt: '2026-11-01T14:00:00Z',
    finishedAt: null,
  },
  findings: [
    { tooth: 16, condition: 'corona', surfaces: ['M'], encounterId: 'encounter', recordedAt: '2026-11-01T14:00:00Z', notes: null },
  ],
  anamnesis: null,
  plan: [],
  treatments: [],
  supplies: [],
  invoice: null,
  addenda: [],
  canFinish: true,
  canDiscount: false,
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
})
beforeEach(() => {
  vi.clearAllMocks()
  actions.add.mockResolvedValue({ ok: true, data: undefined })
  actions.remove.mockResolvedValue({ ok: true, data: undefined })
})
afterEach(cleanup)

describe('Marcación visual integrada a la consulta', () => {
  it('envía paciente, atención y pieza correctos, y conserva las caras ya registradas al cambiar de hallazgo', async () => {
    render(<ConsultaView data={data} />)
    fireEvent.click(screen.getByRole('button', { name: /pieza 16: Corona/ }))
    const editor = screen.getByRole('dialog', { name: 'Estado del diente' })
    fireEvent.click(within(editor).getByRole('button', { name: 'Roto / fracturado' }))
    await waitFor(() =>
      expect(actions.add).toHaveBeenCalledExactlyOnceWith({
        patientId: 'patient',
        encounterId: 'encounter',
        tooth: 16,
        condition: 'fractura',
        surfaces: ['M'],
      }),
    )
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Estado del diente' })).toBeTruthy())
    expect(actions.refresh).toHaveBeenCalledTimes(1)
  })

  it('muestra el rechazo del servidor en el editor y no anuncia guardado', async () => {
    actions.add.mockResolvedValue({ ok: false, error: { code: 'IMMUTABLE', message: 'Esta atención ya terminó.' } })
    render(<ConsultaView data={data} />)
    fireEvent.click(screen.getByRole('button', { name: /pieza 21:/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Estado del diente' })).getByRole('button', { name: 'Caries' }))
    expect(await screen.findByText('Esta atención ya terminó.')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Estado del diente' })).toBeTruthy()
    expect(screen.queryByText('Estado guardado: Caries · pieza 21')).toBeNull()
    expect(actions.refresh).not.toHaveBeenCalled()
  })

  it('quita únicamente la marca de la pieza elegida en la atención actual', async () => {
    render(<ConsultaView data={data} />)
    fireEvent.click(screen.getByRole('button', { name: /pieza 16: Corona/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Estado del diente' })).getByRole('button', { name: 'Quitar marca de hoy' }))
    await waitFor(() => expect(actions.remove).toHaveBeenCalledExactlyOnceWith({ encounterId: 'encounter', tooth: 16 }))
    expect(actions.add).not.toHaveBeenCalled()
    expect(actions.refresh).toHaveBeenCalledTimes(1)
  })
})
