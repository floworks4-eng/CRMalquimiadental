-- F1-016 · Buckets y politicas de Storage. Ruta obligatoria: clinical/{clinic_id}/{patient_id}/{uuid}.{ext}
set search_path = public, extensions;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('clinical', 'clinical', false, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('clinic', 'clinic', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('imports', 'imports', false, 20971520, array['text/csv', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- Paciente y clinica salen de la ruta; si la ruta no tiene la forma esperada, se niega.
create function public.storage_can_read_clinical(p_name text) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare parts text[] := storage.foldername(p_name);
begin
  if coalesce(array_length(parts, 1), 0) < 2
     or parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return exists (select 1 from public.patients p where p.id = parts[2]::uuid and p.clinic_id = parts[1]::uuid)
     and public.can_read_clinical(parts[2]::uuid);
end $$;

create function public.storage_is_clinic_admin(p_name text) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare parts text[] := storage.foldername(p_name);
begin
  if coalesce(array_length(parts, 1), 0) < 1 or parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_admin(parts[1]::uuid);
end $$;
grant execute on function public.storage_can_read_clinical(text), public.storage_is_clinic_admin(text) to authenticated;

create policy clinical_read on storage.objects for select to authenticated
  using (bucket_id = 'clinical' and public.storage_can_read_clinical(name));
create policy clinical_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'clinical' and public.storage_can_read_clinical(name));
-- Sin update ni delete en clinical: los archivos clinicos no se reemplazan, se agregan.

create policy clinic_assets_write on storage.objects for all to authenticated
  using (bucket_id = 'clinic' and public.storage_is_clinic_admin(name))
  with check (bucket_id = 'clinic' and public.storage_is_clinic_admin(name));

create policy imports_admin on storage.objects for all to authenticated
  using (bucket_id = 'imports' and public.storage_is_clinic_admin(name))
  with check (bucket_id = 'imports' and public.storage_is_clinic_admin(name));
