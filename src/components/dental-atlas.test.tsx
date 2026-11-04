// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DentalAtlas } from './dental-atlas'
const api = vi.hoisted(() => ({ load: vi.fn(), add: vi.fn() }))
vi.mock('@/server/actions/dental', () => ({
  listDentalAppointments: async () => [{ id: 'a1', startsAt: '2026-11-04T14:00:00Z', patient: { fullName: 'Ana' }, dentist: { fullName: 'Doctora' } }],
  loadDentalSession: api.load,
}))
vi.mock('@/server/actions/clinical', () => ({ addFinding: api.add, removeFinding: vi.fn(), startEncounter: vi.fn() }))
vi.mock('./dental-workspace', () => ({ DentalWorkspace: ({ onMark, marks, disabled }: { disabled?: boolean; onMark?: (tooth: number, condition: string) => void; marks: Record<number, {condition:string}> }) => <div><button disabled={!onMark || disabled} onClick={() => onMark?.(16,'obturacion')}>Restaurar pieza 16</button><output>{marks[16]?.condition}</output></div> }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('asocia el estado al paciente y atención elegidos y lo conserva en pantalla tras guardar', async () => {
  api.load.mockResolvedValue({ patient: { id:'p1', fullName:'Ana' }, encounter:{ id:'e1',status:'in_progress' }, findings:[], canStart:false })
  api.add.mockResolvedValue({ok:true})
  render(<DentalAtlas />)
  await screen.findByRole('option', { name: /Ana/ })
  expect((screen.getByRole('button', {name:'Restaurar pieza 16'}) as HTMLButtonElement).disabled).toBe(false)
  fireEvent.change(screen.getByLabelText('Paciente y atención'), {target:{value:'a1'}})
  await screen.findByText(/Atención en curso/)
  fireEvent.click(screen.getByRole('button', {name:'Restaurar pieza 16'}))
  await waitFor(() => expect(api.add).toHaveBeenCalledWith({ encounterId:'e1', patientId:'p1', tooth:16, condition:'obturacion', surfaces:[] }))
  await screen.findByText('obturacion')
  fireEvent.change(screen.getByLabelText('Paciente y atención'), {target:{value:''}})
  expect(screen.queryByText('obturacion')).toBeNull()
})
it('mantiene una atención terminada en solo lectura', async () => {
  api.load.mockResolvedValue({ patient: {id:'p1',fullName:'Ana'}, encounter:{id:'e1',status:'finished'}, findings:[], canStart:false })
  render(<DentalAtlas />)
  await screen.findByRole('option', {name:/Ana/})
  fireEvent.change(screen.getByLabelText('Paciente y atención'), {target:{value:'a1'}})
  await screen.findByText(/Atención cerrada/)
  expect((screen.getByRole('button', {name:'Restaurar pieza 16'}) as HTMLButtonElement).disabled).toBe(true)
  expect(api.add).not.toHaveBeenCalled()
})

it('permite marcar el modelo sin cita con un aviso de prueba y sin escribir en la historia clínica', async () => {
  render(<DentalAtlas />)
  await screen.findByRole('option', {name:/Ana/})
  expect(screen.getByText(/Prueba sin paciente:/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', {name:'Restaurar pieza 16'}))
  await screen.findByText('obturacion')
  expect(api.add).not.toHaveBeenCalled()
})
