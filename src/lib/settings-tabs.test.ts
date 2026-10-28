import { describe, expect, it } from 'vitest'
import { settingsTab, TABS } from './settings-tabs'

describe('navegación de configuración compartida entre servidor y cliente', () => {
  it('respeta las pestañas de equipo, tratamientos e importación enviadas en la URL', () => {
    for (const tab of Object.keys(TABS)) expect(settingsTab(tab)).toBe(tab)
  })
  it('ignora valores desconocidos y propiedades heredadas', () => {
    for (const tab of [undefined, '', 'desconocido', 'constructor', 'toString', '__proto__']) expect(settingsTab(tab)).toBe('clinica')
  })
})
