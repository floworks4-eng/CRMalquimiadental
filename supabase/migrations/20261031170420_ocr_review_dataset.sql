-- Original documents and predictions are immutable. Reviews are append-only.
create table public.ocr_documents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  filename text not null check (length(filename) between 1 and 255),
  original_path text not null unique,
  prepared_path text not null unique,
  width int not null check (width between 1 and 5000),
  height int not null check (height between 1 and 5000),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  result jsonb not null check (result ? 'lines' and jsonb_typeof(result->'lines') = 'array' and jsonb_array_length(result->'lines') between 1 and 500),
  check (original_path in (clinic_id::text || '/' || created_by::text || '/' || id::text || '/original.jpg',clinic_id::text || '/' || created_by::text || '/' || id::text || '/original.png',clinic_id::text || '/' || created_by::text || '/' || id::text || '/original.webp')),
  check (prepared_path = clinic_id::text || '/' || created_by::text || '/' || id::text || '/prepared.png')
);
create index ocr_documents_clinic_created on public.ocr_documents(clinic_id,created_at desc);
create index ocr_documents_creator on public.ocr_documents(created_by);

create table public.ocr_reviews (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.ocr_documents(id),
  revision int not null check (revision > 0),
  reviewed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  approved boolean not null default false,
  training_allowed boolean not null default false,
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  unique(document_id,revision)
);
create index ocr_reviews_author on public.ocr_reviews(reviewed_by);
alter table public.ocr_documents enable row level security;
alter table public.ocr_reviews enable row level security;
revoke all on public.ocr_documents,public.ocr_reviews from anon,authenticated;
grant select,insert on public.ocr_documents,public.ocr_reviews to authenticated;

create policy ocr_document_read on public.ocr_documents for select to authenticated using (
  exists (select 1 from public.clinic_members m where m.user_id = (select auth.uid()) and m.active and m.clinic_id = ocr_documents.clinic_id and (m.role = 'clinic_admin' or (m.role = 'dentist' and ocr_documents.created_by = (select auth.uid()))))
);
create policy ocr_document_insert on public.ocr_documents for insert to authenticated with check (
  created_by = (select auth.uid()) and exists (select 1 from public.clinic_members m where m.user_id = (select auth.uid()) and m.active and m.clinic_id = ocr_documents.clinic_id and m.role in ('clinic_admin','dentist'))
);
create policy ocr_review_read on public.ocr_reviews for select to authenticated using (
  exists (select 1 from public.ocr_documents d where d.id = ocr_reviews.document_id)
);
create policy ocr_review_insert on public.ocr_reviews for insert to authenticated with check (
  reviewed_by = (select auth.uid()) and exists (select 1 from public.ocr_documents d where d.id = ocr_reviews.document_id)
);

create function public.validate_ocr_review() returns trigger language plpgsql security invoker set search_path = '' as $$
declare original jsonb; entry jsonb; pos int := 0; latest int;
begin
  -- Serialize revisions for the same document, including direct Data API writes.
  perform pg_advisory_xact_lock(hashtextextended(new.document_id::text,0));
  select result->'lines' into original from public.ocr_documents where id = new.document_id;
  if original is null then raise exception 'Document unavailable' using errcode='42501'; end if;
  select coalesce(max(revision),0) into latest from public.ocr_reviews where document_id = new.document_id;
  if new.revision <> latest + 1 then raise exception 'Stale revision' using errcode='40001'; end if;
  if jsonb_array_length(new.lines) <> jsonb_array_length(original) then raise exception 'All lines must be preserved'; end if;
  for entry in select value from jsonb_array_elements(new.lines) loop
    if not (entry ?& array['index','text','reviewed','excluded','kind']) or
       jsonb_typeof(entry->'text') <> 'string' or length(entry->>'text') > 10000 or
       jsonb_typeof(entry->'reviewed') <> 'boolean' or jsonb_typeof(entry->'excluded') <> 'boolean' or
       jsonb_typeof(entry->'index') <> 'number' or entry->>'index' <> pos::text or entry->>'kind' not in ('unknown','printed','handwritten') then
      raise exception 'Invalid annotation';
    end if;
    if new.approved and (not (entry->>'reviewed')::boolean or (not (entry->>'excluded')::boolean and btrim(entry->>'text') = '')) then
      raise exception 'Every line must be verified or explicitly excluded';
    end if;
    pos := pos + 1;
  end loop;
  new.created_at := now();
  return new;
end $$;
revoke all on function public.validate_ocr_review() from public,anon,authenticated;
create trigger ocr_review_validation before insert on public.ocr_reviews for each row execute function public.validate_ocr_review();

-- Dataset stays private and respects the same RLS as the underlying tables.
-- Only the latest approved revision, explicitly enabled and marked handwritten, is eligible.
create view public.ocr_training_dataset with (security_invoker = true) as
select d.clinic_id, d.id as document_id, r.revision, (a.value->>'index')::int as line_index,
       d.prepared_path as image_path, d.width, d.height,
       d.result->'lines'->((a.value->>'index')::int)->'polygon' as polygon,
       a.value->>'text' as transcription, r.reviewed_by, r.created_at as reviewed_at,
       d.result->'models' as models
from public.ocr_documents d join public.ocr_reviews r on r.document_id = d.id
cross join lateral jsonb_array_elements(r.lines) a(value)
where r.approved and r.training_allowed and (a.value->>'reviewed')::boolean
  and not (a.value->>'excluded')::boolean and a.value->>'kind' = 'handwritten'
  and d.result->'lines'->((a.value->>'index')::int)->'polygon' <> 'null'::jsonb
  and not exists (select 1 from public.ocr_reviews newer where newer.document_id = d.id and newer.revision > r.revision);
revoke all on public.ocr_training_dataset from anon,authenticated;
grant select on public.ocr_training_dataset to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('ocr-review','ocr-review',false,20971520,array['image/jpeg','image/png','image/webp']);
create policy ocr_image_read on storage.objects for select to authenticated using (
  bucket_id = 'ocr-review' and exists (select 1 from public.clinic_members m
  where m.user_id = (select auth.uid()) and m.active and m.clinic_id::text = (storage.foldername(name))[1]
  and (m.role = 'clinic_admin' or (m.role = 'dentist' and (storage.foldername(name))[2] = (select auth.uid())::text)))
);
create policy ocr_image_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'ocr-review' and (storage.foldername(name))[2] = (select auth.uid())::text and exists (
  select 1 from public.clinic_members m where m.user_id = (select auth.uid()) and m.active
  and m.clinic_id::text = (storage.foldername(name))[1] and m.role in ('clinic_admin','dentist'))
);
-- Compensate a failed upload/metadata insert, but never remove referenced images.
create policy ocr_image_cleanup on storage.objects for delete to authenticated using (
  bucket_id = 'ocr-review' and (storage.foldername(name))[2] = (select auth.uid())::text
  and not exists(select 1 from public.ocr_documents d where d.original_path = name or d.prepared_path = name)
);
