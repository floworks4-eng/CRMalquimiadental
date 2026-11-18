import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClinicalReportContext } from '@/lib/domain/clinical-report'
import type { ClinicalFields } from '@/lib/domain/clinical-record'
import { readPages } from './queries/read-pages'
import { latestDentalFindings } from '@/lib/domain/dental'
import { findingsOf, toothStatesOf } from './queries/clinical'
export async function clinicalReportContext(db: SupabaseClient, patientId: string, clinicId: string): Promise<ClinicalReportContext> {
  const [patient, clinic, anamnesis, assessment, findings, states, plan] = await Promise.all([
    db
      .from('patients')
      .select('id,birth_date,sex,phone_e164,address,primary_dentist:profiles!patients_primary_dentist_id_fkey(full_name)')
      .eq('id', patientId)
      .single(),
    db.from('clinics').select('name,address,phone').eq('id', clinicId).single(),
    db
      .from('v_current_anamnesis')
      .select('submitted_at,source,reason,allergies,allergy_other,conditions,medications,pregnancy,anticoagulants')
      .eq('patient_id', patientId)
      .maybeSingle(),
    db
      .from('clinical_assessments')
      .select('fields,patient_visible,created_at,author:profiles!clinical_assessments_created_by_fkey(full_name)')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .order('id')
      .limit(1)
      .maybeSingle(),
    findingsOf(db, patientId),
    toothStatesOf(db, patientId),
    readPages<{ tooth_fdi: number | null; status: string; treatment: { name: string } | null }>(
      (a, b) =>
        db
          .from('treatment_plan_items')
          .select('tooth_fdi,status,treatment:treatments(name)')
          .eq('patient_id', patientId)
          .neq('status', 'cancelled')
          .order('sequence')
          .order('id')
          .range(a, b),
      'No pudimos cargar el plan clínico.',
    ),
  ])
  for (const r of [patient, clinic, anamnesis, assessment])
    if (r.error) throw new Error('No pudimos cargar la información clínica completa para exportar.')
  const p = patient.data,
    a = anamnesis.data,
    c = clinic.data,
    e = assessment.data?.patient_visible ? assessment.data : null
  return {
    clinic: c ?? undefined,
    patient: p
      ? {
          id: p.id,
          birthDate: p.birth_date,
          sex: p.sex,
          phone: p.phone_e164,
          address: p.address,
          primaryDentist: (p.primary_dentist as unknown as { full_name: string } | null)?.full_name,
        }
      : undefined,
    anamnesis: a
      ? {
          recordedAt: a.submitted_at,
          source: a.source,
          reason: a.reason,
          allergies: [...(a.allergies ?? []), ...(a.allergy_other ? [a.allergy_other] : [])],
          conditions: a.conditions ?? [],
          medications: a.medications,
          pregnancy: a.pregnancy,
          anticoagulants: a.anticoagulants,
        }
      : null,
    assessment: e
      ? {
          fields: e.fields as ClinicalFields,
          author: (e.author as unknown as { full_name: string } | null)?.full_name ?? 'Profesional',
          createdAt: e.created_at,
        }
      : null,
    teeth: latestDentalFindings(findings, states).map((f) => ({ tooth: f.tooth, condition: f.condition, recordedAt: f.recordedAt })),
    plan: plan.map((p) => ({ treatment: p.treatment?.name ?? 'Tratamiento', tooth: p.tooth_fdi, status: p.status })),
  }
}
