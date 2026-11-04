import { describe, expect, it } from 'vitest'
import { summarizeCashMovements } from './cash-report'

describe('Resumen de caja', () => {
  it('separa cobros, anulaciones, gastos e ingresos no clínicos sin inflar el flujo', () => {
    const result = summarizeCashMovements([
      { kind: 'income', category: 'tratamiento', amount_cents: 10000, method: 'cash' },
      { kind: 'adjustment', category: 'anulacion', amount_cents: -3000, method: 'cash' },
      { kind: 'expense', category: 'Insumos', amount_cents: -2000, method: 'cash' },
      { kind: 'income', category: 'Venta de producto', amount_cents: 5000, method: 'qr' },
    ])
    expect(result.collectedCents).toBe(7000)
    expect(result.otherIncomeCents).toBe(5000)
    expect(result.expensesCents).toBe(2000)
    expect(result.netCents).toBe(10000)
    expect(result.byMethod.cash).toBe(5000)
    expect(result.byMethod.qr).toBe(5000)
    expect(result.byCategory.find((x) => x.name === 'Insumos')?.cents).toBe(-2000)
  })
})
