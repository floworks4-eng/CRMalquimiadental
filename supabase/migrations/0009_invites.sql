-- F1-017 · Aceptar una invitacion es atomico y solo lo ejecuta el servidor (service_role).
-- Flujo: el admin crea la invitacion (token aleatorio, solo se guarda su hash). Quien la recibe elige su
-- contrasena en /invitacion/[token]; el servidor crea el usuario de Auth y llama a esta funcion.
set search_path = public, extensions;

create function public.accept_invite(p_token_hash bytea, p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.member_invites;
  u_email text;
begin
  select * into inv from public.member_invites where token_hash = p_token_hash for update;
  if not found or inv.accepted_at is not null or inv.expires_at <= now() then
    raise exception 'INVITE_INVALID' using errcode = 'P0001';
  end if;

  select email into u_email from auth.users where id = p_user_id;
  if u_email is null or lower(u_email) <> lower(inv.email::text) then
    raise exception 'INVITE_INVALID' using errcode = 'P0001';
  end if;

  insert into public.clinic_members (clinic_id, user_id, role) values (inv.clinic_id, p_user_id, inv.role);
  update public.member_invites set accepted_at = now() where id = inv.id;

  insert into public.audit_log (clinic_id, actor_id, action, entity_type, entity_id, after)
  values (inv.clinic_id, p_user_id, 'member_invites.accept', 'member_invites', inv.id, jsonb_build_object('role', inv.role));

  return jsonb_build_object('clinic_id', inv.clinic_id, 'role', inv.role);
end $$;

revoke all on function public.accept_invite(bytea, uuid) from public, anon, authenticated;
grant execute on function public.accept_invite(bytea, uuid) to service_role;
