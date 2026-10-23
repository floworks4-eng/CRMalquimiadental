import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '../supabase/server'
import { requireMember } from '../auth/guards'
import { can } from '../auth/permissions'
import { dayBoundsUtc } from '@/lib/domain/time'
import type { AppointmentSource, AppointmentStatus } from '@/lib/domain/status'
import type { AppointmentCard, BookingOptions, DayBoard } from './types'

const SELECT = `id, starts_at, ends_at, status, source, notes, cancellation_reason, checked_in_at, updated_at,
  patient:patients(id, full_name),
  dentist:profiles!appointments_dentist_id_fkey(id, full_name),
  cabinet:cabinets(id, name),
  treatment:treatments(id, name),
  campaign:campaigns(name)`

type Row = {
  id: string; starts_at: string; ends_at: string; status: AppointmentStatus; source: AppointmentSource; notes: string | null
  cancellation_reason: string | null; checked_in_at: string | null; updated_at: string
  patient: { id: string; full_name: string } | null; dentist: { id: string; full_name: string }
  cabinet: { id: string; name: string }; treatment: { id: string; name: string } | null; campaign: { name: string } | null
}

/** Citas con nombres ya resueltos. RLS decide cuales ve cada rol (el odontologo solo las suyas). */
export async function appointmentCards(
  supabase: SupabaseClient,
  refine: (q: ReturnType<ReturnType<SupabaseClient['from']>['select']>) => PromiseLike<{ data: unknown; error: unknown }> | ReturnType<ReturnType<SupabaseClient['from']>['select']>,
): Promise<AppointmentCard[]> {
  const { data, error } = await refine(supabase.from('appointments').select(SELECT))
  if (error) throw new Error('No pudimos cargar las citas')
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id, startsAt: r.starts_at, endsAt: r.ends_at, status: r.status, source: r.source, notes: r.notes,
    cancellationReason: r.cancellation_reason, checkedInAt: r.checked_in_at, updatedAt: r.updated_at,
    patient: r.patient ? { id: r.patient.id, fullName: r.patient.full_name } : null,
    dentist: { id: r.dentist.id, fullName: r.dentist.full_name },
    cabinet: r.cabinet, treatment: r.treatment, campaignName: r.campaign?.name ?? null,
  }))
}

const hhmm = (t: string) => t.slice(0, 5)

/** Odontologos, tratamientos y campañas para los formularios de cita y paciente. */
export async function getBookingOptions(): Promise<BookingOptions> {
  await requireMember()
  const supabase = await createClient()
  const [members, treatments, campaigns] = await Promise.all([
    supabase.from('clinic_members').select('user_id, profiles(full_name)').eq('active', true).in('role', ['dentist', 'clinic_admin']),
    supabase.from('treatments').select('id, name, duration_min').eq('active', true).order('sort'),
    supabase.from('campaigns').select('id, name').eq('active', true).order('name'),
  ])
  return {
    dentists: ((members.data ?? []) as unknown as { user_id: string; profiles: { full_name: string } | null }[]).map((m) => ({ id: m.user_id, fullName: m.profiles?.full_name ?? '—' })),
    treatments: ((treatments.data ?? []) as { id: string; name: string; duration_min: number }[]).map((t) => ({ id: t.id, name: t.name, durationMin: t.duration_min })),
    campaigns: (campaigns.data ?? []) as { id: string; name: string }[],
  }
}

export async function getDayBoard(date: string): Promise<DayBoard> {
  const s = await requireMember()
  if (!can(s.member.role, 'agenda.read_all') && !can(s.member.role, 'agenda.read_own')) throw new Error('FORBIDDEN')
  const supabase = await createClient()
  const [from, to] = dayBoundsUtc(date)
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()

  const [cabinets, options, hours, holiday, appointments] = await Promise.all([
    supabase.from('cabinets').select('id, name').eq('active', true).order('sort').order('name'),
    getBookingOptions(),
    supabase.from('clinic_hours').select('opens_at, closes_at, is_closed').eq('weekday', weekday).maybeSingle(),
    supabase.from('clinic_holidays').select('name').eq('date', date).maybeSingle(),
    appointmentCards(supabase, (q) => q.gte('starts_at', from).lt('starts_at', to).order('starts_at')),
  ])

  const h = hours.data as { opens_at: string | null; closes_at: string | null; is_closed: boolean } | null
  const holidayName = (holiday.data as { name: string } | null)?.name
  const open = h && !h.is_closed && h.opens_at && h.closes_at && !holidayName
  return {
    date,
    cabinets: (cabinets.data ?? []) as { id: string; name: string }[],
    ...options,
    hours: open ? { opens: hhmm(h.opens_at!), closes: hhmm(h.closes_at!) } : null,
    closedReason: holidayName ? `Feriado: ${holidayName}` : h?.is_closed || !h ? 'La clínica no atiende este día' : null,
    appointments,
  }
}
