-- Upsert sin pedir UPDATE sobre las columnas inmutables de identidad del paciente/diente.
create function public.save_patient_tooth_state(
  p_clinic uuid, p_patient uuid, p_tooth integer, p_condition public.tooth_condition,
  p_surfaces text[], p_updated_by uuid
) returns void language sql security invoker set search_path = '' as $$
  insert into public.patient_tooth_states (clinic_id,patient_id,tooth_fdi,condition,surfaces,updated_by)
  values (p_clinic,p_patient,p_tooth,p_condition,p_surfaces,p_updated_by)
  on conflict (patient_id,tooth_fdi) do update set
    condition=excluded.condition, surfaces=excluded.surfaces, updated_by=excluded.updated_by, updated_at=now();
$$;
revoke all on function public.save_patient_tooth_state(uuid,uuid,integer,public.tooth_condition,text[],uuid) from public, anon;
grant execute on function public.save_patient_tooth_state(uuid,uuid,integer,public.tooth_condition,text[],uuid) to authenticated;
