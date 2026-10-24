import { SettingsView, TABS, type Tab } from '@/components/configuracion/settings-view'
import { requireCapability } from '@/server/auth/guards'
import { getSettings } from '@/server/queries/settings'

export const metadata = { title: 'Configuración · Alquimia Dental' }

export default async function ConfiguracionPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireCapability('settings.manage')
  const { tab } = await searchParams
  const current: Tab = tab && tab in TABS ? (tab as Tab) : 'clinica'
  return <SettingsView data={await getSettings()} tab={current} />
}
