create or replace function public.validate_ocr_review() returns trigger language plpgsql security invoker set search_path = '' as $$
declare original jsonb; entry jsonb; pos int := 0; latest int;
begin
  -- Serialize revisions for the same document, including direct Data API writes.
  perform pg_advisory_xact_lock(hashtextextended(new.document_id::text,0));
  select result->'lines' into original from public.ocr_documents where id = new.document_id;
  if original is null then raise exception 'Document unavailable' using errcode='42501'; end if;
  select coalesce(max(revision),0) into latest from public.ocr_reviews where document_id = new.document_id;
  if new.revision <> latest + 1 then raise exception 'Stale revision' using errcode='23505'; end if;
  if jsonb_array_length(new.lines) <> jsonb_array_length(original) then raise exception 'All lines must be preserved'; end if;
  for entry in select value from jsonb_array_elements(new.lines) loop
    if not (entry ?& array['index','text','reviewed','excluded','kind']) or
       jsonb_typeof(entry->'text') <> 'string' or length(entry->>'text') > 10000 or
       jsonb_typeof(entry->'reviewed') <> 'boolean' or jsonb_typeof(entry->'excluded') <> 'boolean' or
       jsonb_typeof(entry->'kind') <> 'string' or jsonb_typeof(entry->'index') <> 'number' or entry->>'index' <> pos::text or entry->>'kind' not in ('unknown','printed','handwritten') then
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
