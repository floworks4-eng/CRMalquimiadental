export type ClinicalSession = {
  id: string
  title: string
  sessionDate: string
  status: 'open' | 'closed'
  encounterId: string | null
  createdAt: string
}
export type ClinicalMessage = { id: string; sessionId: string; body: string; patientVisible: boolean; createdAt: string; author: string }
export type FileCategory = 'radiograph' | 'history' | 'surgical_contract' | 'image' | 'document' | 'audio'
export type JournalFile = {
  id: string
  sessionId: string | null
  name: string
  category: FileCategory
  mime: string
  sizeBytes: number
  url: string | null
  createdAt: string
  patientVisible: boolean
}
export type JournalData = { sessions: ClinicalSession[]; messages: ClinicalMessage[]; files: JournalFile[]; aiEnabled: boolean }
export const FILE_CATEGORY_LABEL: Record<FileCategory, string> = {
  radiograph: 'Radiografía',
  history: 'Historia médica',
  surgical_contract: 'Contrato de cirugía',
  image: 'Imagen',
  document: 'Documento',
  audio: 'Audio',
}
