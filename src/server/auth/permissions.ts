// Matriz de capacidades (brief §6.2). Es cosmetica en la UI: la autoridad real es RLS + Server Actions.
// `own` = solo sus pacientes/su agenda. Debe coincidir con las politicas de supabase/migrations/0006.
export type Role = 'clinic_admin' | 'dentist' | 'reception'
export type Scope = 'all' | 'own' | 'none'

const m = (admin: Scope, dentist: Scope, reception: Scope): Record<Role, Scope> => ({ clinic_admin: admin, dentist, reception })

export const CAPABILITIES = {
  'patients.read_directory': m('all', 'own', 'all'),
  'patients.read_clinical': m('all', 'own', 'none'),
  'patients.create': m('all', 'all', 'all'),
  'patients.update_demographics': m('all', 'own', 'all'),
  'patients.merge': m('all', 'none', 'none'),
  'agenda.read_all': m('all', 'none', 'all'),
  'agenda.read_own': m('all', 'own', 'none'),
  'agenda.manage': m('all', 'own', 'all'),
  'checkin.issue': m('all', 'none', 'all'),
  'checkin.manage': m('all', 'own', 'all'),
  'encounters.read': m('all', 'own', 'none'),
  'encounters.write': m('all', 'own', 'none'),
  'encounters.finish': m('all', 'own', 'none'),
  'inventory.read': m('all', 'all', 'all'),
  'inventory.receive': m('all', 'none', 'none'),
  'inventory.adjust': m('all', 'none', 'none'),
  'billing.read': m('all', 'own', 'all'),
  'billing.charge': m('all', 'own', 'all'),
  'billing.void': m('all', 'none', 'none'),
  'cash.open': m('all', 'none', 'all'),
  'cash.close': m('all', 'none', 'all'),
  'cash.read': m('all', 'none', 'all'),
  'reports.operational': m('all', 'none', 'all'),
  'reports.marketing': m('all', 'none', 'none'),
  'members.manage': m('all', 'none', 'none'),
  'settings.manage': m('all', 'none', 'none'),
  'audit.read': m('all', 'none', 'none'),
  'exports.clinical': m('all', 'own', 'none'),
} as const satisfies Record<string, Record<Role, Scope>>

export type Capability = keyof typeof CAPABILITIES

export const scope = (role: Role, cap: Capability): Scope => CAPABILITIES[cap][role]
export const can = (role: Role, cap: Capability) => scope(role, cap) !== 'none'

export const ROLE_LABEL: Record<Role, string> = { clinic_admin: 'Administrador', dentist: 'Odontólogo', reception: 'Recepción' }
