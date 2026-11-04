alter type public.tooth_condition add value if not exists 'sano';
alter type public.tooth_condition add value if not exists 'obturacion';

-- Serializa cambios de la atención y reemplaza la marca de forma atómica.
-- Un error de validación/permiso revierte también el borrado; conserva RLS.
create function public.save_tooth_finding(p_encounter uuid, p_patient uuid, p_tooth integer,
  p_condition public.tooth_condition, p_surfaces text[], p_notes text default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare e public.encounters%rowtype;
begin
  select * into e from public.encounters where id = p_encounter for update;
  if e.id is null or e.patient_id <> p_patient or e.status <> 'in_progress' or auth.uid() is null then
    raise exception 'IMMUTABLE';
  end if;
  delete from public.tooth_findings where encounter_id = p_encounter and tooth_fdi = p_tooth;
  insert into public.tooth_findings (clinic_id, patient_id, encounter_id, tooth_fdi, condition, surfaces, notes, recorded_by)
  values (e.clinic_id, p_patient, p_encounter, p_tooth, p_condition, p_surfaces, p_notes, auth.uid());
end;
$$;
revoke all on function public.save_tooth_finding(uuid, uuid, integer, public.tooth_condition, text[], text) from public, anon;
grant execute on function public.save_tooth_finding(uuid, uuid, integer, public.tooth_condition, text[], text) to authenticated;
