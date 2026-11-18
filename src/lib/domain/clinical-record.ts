import { z } from 'zod'
export const RECORD_GROUPS = [
  {
    title: 'Motivo y enfermedad actual',
    fields: [
      ['chiefComplaint', 'Motivo de consulta'],
      ['presentIllness', 'Enfermedad actual y evolución del motivo'],
    ],
  },
  {
    title: 'Antecedentes e interrogatorio',
    fields: [
      ['personalHistory', 'Antecedentes personales y quirúrgicos'],
      ['familyHistory', 'Antecedentes familiares'],
      ['dentalHistory', 'Antecedentes odontológicos'],
      ['habits', 'Hábitos relevantes'],
      ['reviewSystems', 'Interrogatorio por aparatos y sistemas'],
    ],
  },
  {
    title: 'Exploración y pruebas',
    fields: [
      ['vitalSigns', 'Signos vitales (valor y unidad)'],
      ['extraoralExam', 'Exploración extraoral'],
      ['intraoralExam', 'Exploración intraoral y periodontal'],
      ['complementaryTests', 'Pruebas complementarias e interpretación profesional'],
    ],
  },
  {
    title: 'Valoración y conducta',
    fields: [
      ['diagnosis', 'Diagnóstico clínico / diferencial'],
      ['prognosis', 'Pronóstico'],
      ['treatmentPlan', 'Plan de tratamiento acordado'],
      ['medicationsInstructions', 'Prescripción e indicaciones'],
      ['followUp', 'Seguimiento y próxima revisión'],
    ],
  },
] as const
export type ClinicalField = (typeof RECORD_GROUPS)[number]['fields'][number][0]
export type ClinicalFields = Partial<Record<ClinicalField, string>>
export type ClinicalAssessment = { id: string; fields: ClinicalFields; createdAt: string; author: string; patientVisible: boolean }
const shape = Object.fromEntries(
  RECORD_GROUPS.flatMap((g) => g.fields.map(([key]) => [key, z.string().trim().max(3000).optional()])),
) as Record<ClinicalField, z.ZodOptional<z.ZodString>>
export const clinicalFieldsSchema = z
  .object(shape)
  .strict()
  .refine((value) => Object.values(value).some((v) => v?.trim()), 'Registra al menos un dato clínico.')
  .refine((value) => new TextEncoder().encode(JSON.stringify(value)).length <= 59000, 'La evaluación es demasiado extensa.')
