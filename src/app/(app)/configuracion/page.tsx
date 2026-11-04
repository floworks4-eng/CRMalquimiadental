import { SettingsView } from '@/components/configuracion/settings-view'
import { settingsTab } from '@/lib/settings-tabs'
import { requireCapability } from '@/server/auth/guards'
import { getSettings } from '@/server/queries/settings'

export const metadata = { title: 'Configuración · Alquimia Dental' }

export default async function ConfiguracionPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireCapability('settings.manage')
  const { tab } = await searchParams
  const current = settingsTab(tab)
  return <SettingsView data={await getSettings(current)} tab={current} />
}
