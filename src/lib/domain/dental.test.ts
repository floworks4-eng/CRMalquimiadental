import { describe, expect, it } from 'vitest'
import { dentalToothHistory, latestDentalFindings, type DentalFinding, type DentalStateEvent } from './dental'

const old: DentalFinding = { tooth: 16, condition: 'caries', surfaces: ['M'], encounterId: 'visit', recordedAt: '2026-11-01T14:00:00Z', notes: null }
const direct: DentalFinding = { ...old, condition: 'sano', encounterId: '', recordedAt: '2026-11-02T14:00:00Z' }

describe('shared dental state and retained history', () => {
  it('uses the newest record from either source even when inputs are unsorted', () => {
    const newest = { ...old, condition: 'obturacion' as const, recordedAt: '2026-11-03T14:00:00Z' }
    expect(latestDentalFindings([newest, old], [direct])).toEqual([newest])
    expect(latestDentalFindings([old], [direct])).toEqual([direct])
    expect(latestDentalFindings([old], [])).toEqual([old])
    expect(latestDentalFindings([], [])).toEqual([])
  })
  it('handles equivalent timestamp formats and gives direct edits a deterministic exact tie', () => {
    const sameTime = { ...direct, recordedAt: '2026-11-01T10:00:00-04:00' }
    expect(latestDentalFindings([old], [sameTime])).toEqual([sameTime])
  })
  it('retains replacement and deletion events, without duplicating the current state or restoring a removed mark', () => {
    const events: DentalStateEvent[] = [
      { id: 'create', recordedAt: old.recordedAt, before: null, after: old },
      { id: 'update', recordedAt: direct.recordedAt, before: old, after: direct },
    ]
    expect(dentalToothHistory([], [direct], events, 16).map((e) => e.id)).toEqual(['create', 'update'])
    const deletion = { id: 'delete', recordedAt: '2026-11-03T14:00:00Z', before: direct, after: null }
    expect(dentalToothHistory([old], [], [...events, deletion], 16).at(-1)).toEqual(deletion)
    expect(latestDentalFindings([old], [])).toEqual([old])
    expect(dentalToothHistory([], [], [...events, deletion], 21)).toEqual([])
  })
})
