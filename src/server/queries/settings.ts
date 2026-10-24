import 'server-only'
import { createClient } from '../supabase/server'
import { createAdminClient } from '../supabase/admin'
import { requireCapability } from '../auth/guards'
import type { Role } from '../auth/permissions'

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')

export type SettingsData = {
  clinic: { name: string; legalName: string; nit: string; phone: string; whatsappNumber: string; address: string }
  hours: { weekday: number; closed: boolean; opens: string; closes: string }[]
  holidays: { id: string; date: string; name: string }[]
  cabinets: { id: string; name: string; active: boolean }[]
  categories: { id: string; name: string }[]
  treatments: {
    id: string; code: string; name: string; categoryId: string | null; durationMin: number; priceCents: number; requiresTooth: boolean; active: boolean
    recipe: { supplyItemId: string; qty: number }[]
  }[]
  supplies: { id: string; name: string; unit: string }[]
  members: {
    id: string; userId: string; fullName: string; email: string | null; role: Role; title: string | null; active: boolean
    schedule: { weekday: number; starts: string; ends: string }[]
  }[]
}

export async function getSettings(): Promise<SettingsData> {
  const s = await requireCapability('settings.manage')
  const supabase = await createClient()
  const c = s.member.clinicId
  const [clinic, hours, holidays, cabinets, categories, treatments, recipes, supplies, members, schedules, users] = await Promise.all([
    supabase.from('clinics').select('name, legal_name, nit, phone, whatsapp_number, address').eq('id', c).single(),
    supabase.from('clinic_hours').select('weekday, is_closed, opens_at, closes_at').order('weekday'),
    supabase.from('clinic_holidays').select('id, date, name').gte('date', new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)).order('date'),
    supabase.from('cabinets').select('id, name, active').order('sort').order('name'),
    supabase.from('treatment_categories').select('id, name').order('sort').order('name'),
    supabase.from('treatments').select('id, code, name, category_id, duration_min, price_cents, requires_tooth, active').order('sort').order('name'),
    supabase.from('treatment_supplies').select('treatment_id, supply_item_id, qty'),
    supabase.from('supply_items').select('id, name, unit').eq('active', true).order('name'),
    supabase.from('clinic_members').select('id, user_id, role, title, active, profile:profiles(full_name)').eq('clinic_id', c).order('created_at'),
    supabase.from('dentist_schedules').select('dentist_id, weekday, starts_at, ends_at').eq('active', true).order('weekday'),
    // Correos de acceso del equipo (viven en Auth, no en las tablas de la clinica). Solo lo ve el administrador.
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ])
  const cl = clinic.data as { name: string; legal_name: string | null; nit: string | null; phone: string | null; whatsapp_number: string | null; address: string | null }
  const hourRows = (hours.data ?? []) as { weekday: number; is_closed: boolean; opens_at: string | null; closes_at: string | null }[]
  const recipeRows = (recipes.data ?? []) as { treatment_id: string; supply_item_id: string; qty: number }[]
  const schedRows = (schedules.data ?? []) as { dentist_id: string; weekday: number; starts_at: string; ends_at: string }[]
  const emails = new Map((users.data?.users ?? []).map((u) => [u.id, u.email ?? null]))
  return {
    clinic: { name: cl.name, legalName: cl.legal_name ?? '', nit: cl.nit ?? '', phone: cl.phone ?? '', whatsappNumber: cl.whatsapp_number ?? '', address: cl.address ?? '' },
    hours: Array.from({ length: 7 }, (_, weekday) => {
      const h = hourRows.find((x) => x.weekday === weekday)
      return { weekday, closed: h ? h.is_closed : true, opens: hhmm(h?.opens_at ?? null) || '08:30', closes: hhmm(h?.closes_at ?? null) || '19:30' }
    }),
    holidays: (holidays.data ?? []) as SettingsData['holidays'],
    cabinets: (cabinets.data ?? []) as SettingsData['cabinets'],
    categories: (categories.data ?? []) as SettingsData['categories'],
    treatments: ((treatments.data ?? []) as { id: string; code: string; name: string; category_id: string | null; duration_min: number; price_cents: number; requires_tooth: boolean; active: boolean }[])
      .map((t) => ({
        id: t.id, code: t.code, name: t.name, categoryId: t.category_id, durationMin: t.duration_min, priceCents: t.price_cents, requiresTooth: t.requires_tooth, active: t.active,
        recipe: recipeRows.filter((r) => r.treatment_id === t.id).map((r) => ({ supplyItemId: r.supply_item_id, qty: Number(r.qty) })),
      })),
    supplies: (supplies.data ?? []) as SettingsData['supplies'],
    members: ((members.data ?? []) as unknown as { id: string; user_id: string; role: Role; title: string | null; active: boolean; profile: { full_name: string } | null }[])
      .map((m) => ({
        id: m.id, userId: m.user_id, fullName: m.profile?.full_name ?? '—', email: emails.get(m.user_id) ?? null, role: m.role, title: m.title, active: m.active,
        schedule: schedRows.filter((x) => x.dentist_id === m.user_id).map((x) => ({ weekday: x.weekday, starts: hhmm(x.starts_at), ends: hhmm(x.ends_at) })),
      })),
  }
}
