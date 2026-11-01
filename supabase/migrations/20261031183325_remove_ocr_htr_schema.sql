drop view if exists public.ocr_training_dataset;
drop policy if exists ocr_image_read on storage.objects;
drop policy if exists ocr_image_insert on storage.objects;
drop policy if exists ocr_image_cleanup on storage.objects;
drop table if exists public.ocr_reviews;
drop table if exists public.ocr_documents;
drop function if exists public.validate_ocr_review();
