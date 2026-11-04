-- Agregados del tablero. SECURITY INVOKER conserva RLS: cada rol solo cuenta filas visibles.
create function public.dashboard_patient_analytics(p_clinic uuid, p_today date)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with visible_patients as (
    select first_source, birth_date
    from public.patients
    where clinic_id = p_clinic and archived_at is null
  ), sources as (
    select first_source::text as key, count(*)::integer as total
    from visible_patients group by first_source
  ), ages as (
    select case
      when birth_date is null then 'unknown'
      when date_part('year', age(p_today, birth_date)) < 18 then '0-17'
      when date_part('year', age(p_today, birth_date)) < 35 then '18-34'
      when date_part('year', age(p_today, birth_date)) < 50 then '35-49'
      when date_part('year', age(p_today, birth_date)) < 65 then '50-64'
      else '65+'
    end as key, count(*)::integer as total
    from visible_patients group by 1
  ), top_treatments as (
    select t.name, count(*)::integer as total
    from public.appointments a
    join public.treatments t on t.id = a.treatment_id
    where a.clinic_id = p_clinic and a.status in ('scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed')
    group by t.id, t.name
    order by total desc, t.name
    limit 5
  )
  select jsonb_build_object(
    'total', (select count(*)::integer from visible_patients),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'total', total) order by total desc, key) from sources), '[]'::jsonb),
    'ages', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'total', total) order by key) from ages), '[]'::jsonb),
    'treatments', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'total', total) order by total desc, name) from top_treatments), '[]'::jsonb)
  );
$$;

revoke all on function public.dashboard_patient_analytics(uuid, date) from public, anon, authenticated;
grant execute on function public.dashboard_patient_analytics(uuid, date) to authenticated;
