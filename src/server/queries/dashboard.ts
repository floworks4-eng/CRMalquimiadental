import 'server-only'
import { createClient } from '../supabase/server'
import { requireMember } from '../auth/guards'
import { can } from '../auth/permissions'
import { dayBoundsUtc, todayLaPaz } from '@/lib/domain/time'
import { appointmentCards } from './agenda'
import type { AppointmentCard } from './types'

export type Dashboard = {
  date: string
  appointments: AppointmentCard[]
  money: { incomeTodayCents: number; pendingCount: number; pendingCents: number; cashOpen: boolean } | null
  lowStock: { name: string; onHand: number; minStock: number; unit: string }[]
  /** Pasos de puesta en marcha (solo admin) mientras falte algo basico. */
  setup: { treatments: number; members: number; supplies: number; patients: number; hoursReviewed: boolean } | null
}

export async function getDashboard(): Promise<Dashboard> {
  const s = await requireMember()
  const role = s.member.role
  const supabase = await createClient()
  const date = todayLaPaz()
  const [from, to] = dayBoundsUtc(date)

  const readMoney = async (): Promise<Dashboard['money']> => {
    if (!can(role, 'cash.read')) return null
    const [{ data: tx }, { data: pending }, { data: open }] = await Promise.all([
      supabase.from('transactions').select('amount_cents').gte('created_at', from).lt('created_at', to),
      supabase.from('invoices').select('total_cents, paid_cents').in('status', ['issued', 'partially_paid']),
      supabase.from('cash_sessions').select('id').eq('status', 'open').maybeSingle(),
    ])
    const p = (pending ?? []) as { total_cents: number; paid_cents: number }[]
    return {
      incomeTodayCents: ((tx ?? []) as { amount_cents: number }[]).reduce((sum, t) => sum + t.amount_cents, 0),
      pendingCount: p.length,
      pendingCents: p.reduce((sum, i) => sum + i.total_cents - i.paid_cents, 0),
      cashOpen: !!open,
    }
  }

  const readSetup = async (): Promise<Dashboard['setup']> => {
    if (role !== 'clinic_admin') return null
    const count = async (table: string) => (await supabase.from(table).select('id', { count: 'exact', head: true })).count ?? 0
    const [treatments, members, supplies, patients, audit] = await Promise.all([
      count('treatments'), count('clinic_members'), count('supply_items'), count('patients'),
      supabase.from('audit_log').select('id', { count: 'exact', head: true }).eq('entity_type', 'clinic_hours').eq('action', 'clinic_hours.update'),
    ])
    const s2 = { treatments, members, supplies, patients, hoursReviewed: (audit.count ?? 0) > 0 }
    return !treatments || members < 2 || !supplies || !patients || !s2.hoursReviewed ? s2 : null
  }

  // Bloques independientes, siempre con el cliente de la sesión y sus permisos.
  const [appointments, money, { data: stock }, setup] = await Promise.all([
    appointmentCards(supabase, (q) => q.gte('starts_at', from).lt('starts_at', to).order('starts_at')),
    readMoney(),
    supabase.from('v_stock').select('name, on_hand, min_stock, unit, active').eq('active', true),
    readSetup(),
  ])
  const lowStock = ((stock ?? []) as { name: string; on_hand: number; min_stock: number; unit: string }[])
    .filter((x) => Number(x.min_stock) > 0 && Number(x.on_hand) <= Number(x.min_stock))
    .map((x) => ({ name: x.name, onHand: Number(x.on_hand), minStock: Number(x.min_stock), unit: x.unit }))
  return { date, appointments, money, lowStock, setup }
}
