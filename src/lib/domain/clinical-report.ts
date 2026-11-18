import type { ClinicalFields } from './clinical-record'
export type ClinicalReportContext = {
  clinic?: { name: string; address?: string | null; phone?: string | null }
  patient?: {
    id: string
    birthDate?: string | null
    sex?: string | null
    phone?: string | null
    address?: string | null
    primaryDentist?: string | null
  }
  anamnesis?: {
    recordedAt: string
    source: string
    reason?: string | null
    allergies: string[]
    conditions: string[]
    medications?: string | null
    pregnancy: boolean | null
    anticoagulants: boolean | null
  } | null
  assessment?: { fields: ClinicalFields; author: string; createdAt: string } | null
  teeth?: { tooth: number; condition: string; recordedAt: string }[]
  plan?: { treatment: string; tooth: number | null; status: string }[]
}
