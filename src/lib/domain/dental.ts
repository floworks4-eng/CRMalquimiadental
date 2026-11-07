import type { ToothCondition } from './clinical'

export type DentalFinding = {
  tooth: number; condition: ToothCondition; surfaces: string[]; encounterId: string; recordedAt: string; notes: string | null
}
export type DentalStateSnapshot = Pick<DentalFinding, 'tooth' | 'condition' | 'surfaces'>
export type DentalStateEvent = {
  id: string; recordedAt: string; before: DentalStateSnapshot | null; after: DentalStateSnapshot | null
}

/** Both chart edits and encounter findings describe the same current tooth, ordered by actual time. */
export function latestDentalFindings(findings: readonly DentalFinding[], toothStates: readonly DentalFinding[] = []): DentalFinding[] {
  const latest = new Map<number, DentalFinding>()
  for (const finding of [...findings, ...toothStates]) {
    const previous = latest.get(finding.tooth)
    // Direct chart edits win an exact timestamp tie, consistently in every view.
    if (!previous || Date.parse(finding.recordedAt) >= Date.parse(previous.recordedAt)) latest.set(finding.tooth, finding)
  }
  return [...latest.values()]
}

/** Audit rows are history only: a deletion must never resurrect a mark on the current chart. */
export function dentalToothHistory(
  findings: readonly DentalFinding[], toothStates: readonly DentalFinding[], events: readonly DentalStateEvent[], tooth: number,
): DentalStateEvent[] {
  const history: DentalStateEvent[] = findings.filter((f) => f.tooth === tooth).map((f, index) => ({
    id: `encounter:${f.encounterId}:${tooth}:${index}`, recordedAt: f.recordedAt, before: null, after: f,
  }))
  history.push(...events.filter((e) => (e.after ?? e.before)?.tooth === tooth))
  for (const state of toothStates.filter((f) => f.tooth === tooth)) {
    if (!events.some((e) => e.after?.tooth === tooth && Date.parse(e.recordedAt) === Date.parse(state.recordedAt))) {
      history.push({ id: `state:${tooth}`, recordedAt: state.recordedAt, before: null, after: state })
    }
  }
  return history.sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt))
}
