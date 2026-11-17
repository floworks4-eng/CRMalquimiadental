import { processJournalFile } from '@/server/journal-ai'
export const maxDuration = 60
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return processJournalFile(request, id, 'transcribe')
}
