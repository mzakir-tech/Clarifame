-- ClariFrame private source uploads. Apply once in Supabase SQL Editor or with
-- the Supabase CLI after reviewing the storage policy with the project owner.

begin;

create table public.video_uploads (
  id uuid primary key,
  request_id uuid not null,
  user_id uuid not null references auth.users (id) on delete restrict,
  object_path text not null unique,
  status text not null default 'uploading'
    check (status in ('uploading', 'verified', 'rejected', 'deleting')),
  expected_size_bytes bigint not null
    check (expected_size_bytes > 0 and expected_size_bytes <= 524288000),
  inspected_size_bytes bigint,
  duration_seconds double precision,
  container_format text,
  video_codec text,
  audio_codec text,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  -- Longer than the signed token and any in-flight resumable upload URL lifetime.
  expires_at timestamptz default (now() + interval '27 hours'),
  inspected_at timestamptz,
  constraint video_uploads_request_unique unique (user_id, request_id),
  constraint video_uploads_safe_path check (
    object_path = user_id::text || '/' || id::text || '/source'
  ),
  constraint video_uploads_inspected_values check (
    status <> 'verified' or (
      inspected_size_bytes is not null
      and inspected_size_bytes = expected_size_bytes
      and duration_seconds is not null
      and duration_seconds > 0 and duration_seconds <= 60
      and container_format is not null and video_codec is not null
      and width is not null and height is not null
      and width > 0 and height > 0 and inspected_at is not null
    )
  ),
  constraint video_uploads_verified_not_expiring check (status <> 'verified' or expires_at is null)
);

create index video_uploads_owner_created_idx
  on public.video_uploads (user_id, created_at desc);
create index video_uploads_pending_expiry_idx
  on public.video_uploads (expires_at)
  where status in ('uploading', 'deleting');

alter table public.video_uploads enable row level security;
revoke all on public.video_uploads from anon, authenticated;
grant select on public.video_uploads to authenticated;
grant all on public.video_uploads to service_role;
create policy video_uploads_read_own
  on public.video_uploads for select to authenticated
  using (user_id = (select auth.uid()));

do $$
declare
  existing_bucket storage.buckets%rowtype;
begin
  select * into existing_bucket from storage.buckets where id = 'clariframe-private';
  if found then
    if existing_bucket.public is distinct from false
      or existing_bucket.file_size_limit is distinct from 524288000::bigint
      or existing_bucket.allowed_mime_types is not null then
      raise exception 'The clariframe-private bucket already exists with different settings; review it before applying this migration.';
    end if;
  else
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'clariframe-private',
      'clariframe-private',
      false,
      524288000,
      null
    );
  end if;
end $$;

-- All file access is mediated by authenticated Next.js routes that issue short-lived
-- signed upload/read URLs. This restrictive policy also blocks any older permissive
-- anon/authenticated object policies for this bucket without deleting or replacing them.
create policy clariframe_block_direct_client_storage
  on storage.objects as restrictive
  for all to anon, authenticated
  using (bucket_id <> 'clariframe-private')
  with check (bucket_id <> 'clariframe-private');

commit;
