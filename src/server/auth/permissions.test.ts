import { describe, expect, it } from 'vitest'
import { CAPABILITIES, can, scope, type Capability, type Role } from './permissions'

const caps = Object.keys(CAPABILITIES) as Capability[]
const roles: Role[] = ['clinic_admin', 'dentist', 'reception']

describe('matriz de capacidades (brief §6.2)', () => {
  it('toda capacidad define los tres roles', () => {
    for (const c of caps) for (const r of roles) expect(['all', 'own', 'none']).toContain(scope(r, c))
  })
  it('el administrador puede todo, sin restricciones de alcance', () => {
    for (const c of caps) expect(scope('clinic_admin', c), c).toBe('all')
  })
  it('recepcion nunca toca datos clinicos, auditoria ni configuracion', () => {
    for (const c of ['patients.read_clinical', 'encounters.read', 'encounters.write', 'encounters.finish', 'exports.clinical', 'audit.read', 'settings.manage', 'members.manage'] as const) {
      expect(can('reception', c), c).toBe(false)
    }
  })
  it('recepcion si cobra y gestiona caja y agenda', () => {
    for (const c of ['billing.charge', 'cash.open', 'cash.close', 'agenda.manage', 'checkin.issue', 'patients.create'] as const) expect(can('reception', c), c).toBe(true)
  })
  it('el odontologo trabaja solo con lo suyo y no toca caja ni equipo', () => {
    for (const c of ['patients.read_clinical', 'encounters.write', 'agenda.manage', 'billing.charge'] as const) expect(scope('dentist', c), c).toBe('own')
    for (const c of ['cash.read', 'members.manage', 'audit.read', 'reports.marketing', 'inventory.adjust'] as const) expect(can('dentist', c), c).toBe(false)
  })
})
