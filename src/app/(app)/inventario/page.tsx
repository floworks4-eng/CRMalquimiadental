import Link from 'next/link'
import { InventoryView } from '@/components/inventario/inventory-view'
import { formatDateTime } from '@/lib/domain/time'
import { requireCapability } from '@/server/auth/guards'
import { can } from '@/server/auth/permissions'
import { getInventory, getPendingStockDeficits, type PendingStockDeficit } from '@/server/queries/inventory'

export const metadata = { title: 'Inventario · Alquimia Dental' }

const formatQuantity = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 3 })

export default async function InventarioPage() {
  const s = await requireCapability('inventory.read')
  const canManage = can(s.member.role, 'inventory.adjust')
  const [data, deficits] = await Promise.all([getInventory(), canManage ? getPendingStockDeficits() : null])
  return (
    <InventoryView data={data} canManage={canManage}>
      {canManage && <PendingDeficits deficits={deficits} />}
    </InventoryView>
  )
}

function PendingDeficits({ deficits }: { deficits: PendingStockDeficit[] | null }) {
  return (
    <section className="glass mb-5 p-5" aria-labelledby="pending-stock-heading">
      <h2 id="pending-stock-heading" className="title-gold text-lg">Insumos pendientes de descontar</h2>
      {deficits === null ? (
        <p role="alert" className="mt-2 text-sm text-bad">No pudimos cargar los insumos pendientes.</p>
      ) : deficits.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No hay faltantes pendientes.</p>
      ) : (
        <ul className="mt-2 max-h-80 divide-y divide-white/8 overflow-y-auto" tabIndex={deficits.length > 4 ? 0 : undefined}>
          {deficits.map((deficit) => {
            const encounter = deficit.patientName ?? `Atención ${deficit.encounterId.slice(0, 8)}`
            return (
              <li key={`${deficit.encounterId}:${deficit.itemId}`} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{deficit.itemName ?? 'Insumo'}</p>
                  <p className="mt-1 text-xs text-muted">
                    {deficit.appointmentId ? (
                      <Link href={`/consulta/${deficit.appointmentId}`} prefetch={false} className="text-gold-soft underline underline-offset-2">
                        {encounter}
                      </Link>
                    ) : encounter}
                    {' · '}
                    <time dateTime={deficit.createdAt}>{formatDateTime(deficit.createdAt)}</time>
                  </p>
                </div>
                <p className="num shrink-0 text-warn">{formatQuantity.format(deficit.quantity)}{deficit.unit && ` ${deficit.unit}`}</p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
