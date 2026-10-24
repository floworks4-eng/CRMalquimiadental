import { InventoryView } from '@/components/inventario/inventory-view'
import { requireCapability } from '@/server/auth/guards'
import { can } from '@/server/auth/permissions'
import { getInventory } from '@/server/queries/inventory'

export const metadata = { title: 'Inventario · Alquimia Dental' }

export default async function InventarioPage() {
  const s = await requireCapability('inventory.read')
  return <InventoryView data={await getInventory()} canManage={can(s.member.role, 'inventory.adjust')} />
}
