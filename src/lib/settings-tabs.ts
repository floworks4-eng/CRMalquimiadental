export const TABS = {
  clinica: 'Clínica',
  horarios: 'Horarios y gabinetes',
  tratamientos: 'Tratamientos y precios',
  equipo: 'Equipo',
  importar: 'Importar pacientes e historial',
} as const

export type Tab = keyof typeof TABS

export function settingsTab(value?: string): Tab {
  return value && Object.hasOwn(TABS, value) ? value as Tab : 'clinica'
}
