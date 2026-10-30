# ClariFrame AI — architecture and implementation status

## Direction

The application is a private video restoration studio. The web app owns the user experience and authenticated upload API; Supabase Auth and Postgres own identities and media metadata; private object storage holds original and output media. A bounded FFprobe metadata check currently runs in a Node.js route after upload; video decoding, transcoding, and AI inference belong in a separate Python worker. GPU work must not run inside web request handlers.

## Single-page experience and current implementation boundary

The root page is a continuous, anchor-navigated experience containing the landing story, workspace, field notes, finishing room, account area, and owner-scoped verified-upload list. `lib/video/constraints.mjs` is the source of truth for MP4, MOV, and WebM browser MIME hints, a 500 MiB upload limit, and a 60-second duration limit. The browser preview remains local until the signed-in user starts an upload. The app creates a server-owned upload row and a unique `<user-id>/<upload-id>/source` path in the private `clariframe-private` bucket, then issues a non-overwrite signed upload token for resumable TUS transfer. The client filename, claimed MIME, duration, and dimensions are never used as proof of media validity; the bucket does not apply a MIME allowlist to claimed metadata. A Node.js route streams the uploaded object to a mode-0600 temporary file under an enforced byte cap, then runs FFprobe with no shell, an input protocol allowlist, bounded probe size/output, and a timeout. Only accepted media is marked `verified`; there is still no processing job or AI output.

The server-only `SUPABASE_SERVICE_ROLE_KEY` is required for metadata/storage administration and must never be exposed to a browser. Every administrative query is scoped by the authenticated `auth.getUser()` identity. Postgres RLS grants authenticated users read access only to their own metadata; client writes are revoked. Storage is private and a restrictive policy blocks direct browser object access to the ClariFrame bucket, including access otherwise granted by older permissive policies; other project buckets are unaffected. Signed upload URLs are issued only by owner-checked server routes. A per-user request identifier is remembered locally (without upload tokens) to resume an interrupted upload after reselecting the same clip. A 27-hour intent expiry exceeds the 2-hour signed-token lifetime plus the TUS upload URL lifetime; `/api/cron/cleanup-uploads` removes expired source objects and rows. `vercel.json` schedules it hourly on Vercel; other hosts must configure their scheduler with `CRON_SECRET`. Account deletion is not implemented; the foreign key intentionally prevents deleting an auth identity while its file records still exist, so users must delete verified uploads first.

FFprobe must be installed on the application host, with `FFPROBE_PATH` set when it is not on `PATH`. Media probing runs in a bounded child process, but the Next.js application does not provide an OS/container sandbox or a worker. Production deployments handling untrusted media should isolate probing in a constrained worker/container and validate platform request-duration and temporary-disk limits. The current codec allowlist accepts MP4/MOV video codecs H.264, HEVC, AV1, MPEG-4 and audio codecs AAC, MP3, ALAC; WebM video codecs VP8, VP9, AV1 and audio codecs Opus, Vorbis. Broaden only after media and browser compatibility testing.

## Authentication milestone (implemented foundation)

Supabase Auth provides email/password sign-up and sign-in using the SSR cookie flow. `proxy.ts` refreshes expiring auth cookies; it is an optimistic refresh layer, not the authorization boundary. The root page and every upload API route verify the user with `auth.getUser()` on the server, and sign-out runs as a server action. The email confirmation endpoint exchanges the PKCE code and redirects to the root page; it accepts no user-supplied return URL. The publishable key is public; service-role administration is server-only.

Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL` from the Supabase project and app origin. Allow `${NEXT_PUBLIC_SITE_URL}/auth/confirm` in Supabase Auth redirect URLs. Use `.env.example` as the local template. A real Supabase project is required to exercise account creation, email confirmation, sign-in, session refresh, and sign-out end to end. Account forms are in the root page without tab or route switching.

## Model direction

For a small real-inference proof of concept, evaluate pretrained Real-ESRGAN frame inference on short low-resolution clips, with FFmpeg reassembly. It is practical to integrate but independent frame enhancement can flicker. Compare it with a temporal video-restoration model such as BasicVSR++ before choosing a production pipeline. Verify model-weight terms separately from repository code licensing.

## First end-to-end acceptance

An authenticated user uploads a supported short video; server-side checks reject invalid content and limits; a durable worker job runs a named pretrained model; output is validated and stored privately; the owner sees real status, compares original/result, and can download/delete; authorization and focused tests cover these paths. Record runtime and observed artifacts from actual sample clips.

## Open decisions

Set server-enforced file-size, resolution, and frame-rate limits; decide POC audio behavior, hosting/GPU provisioning, retention, and model-weight commercial terms before those integrations are implemented. Email/password is the initial identity provider; production email confirmation, abuse controls, and password recovery settings still need configuring in Supabase.

## Audit findings

- Present: Next.js App Router, TypeScript, responsive browser-local file preview, Supabase SSR cookie refresh, email/password server actions, PKCE confirmation callback, and server-side identity lookup on the root page.
- The root route contains all navigable product content. `/auth/confirm` is a callback endpoint only; it is not a separate content page. The former `/auth` and `/studio` content routes were removed.
- Present in this milestone: authenticated upload-intent, resumable signed upload, server inspection, owner-scoped delete, RLS/storage migration, and scheduled cleanup endpoint. They require the migration and secrets/tooling above and have not been tested against a live Supabase project here.
- Not present: AI job tables/queue, worker, FFmpeg transcoding/restoration pipeline, model weights, output validation, signed playback/download endpoint, rate limits, and persistent logs.
- No real model is installed or connected. No progress, output, or comparison result is simulated.
- The repository has no Git metadata. Environment variable names are documented, but this audit did not inspect or print environment values.
- Unit tests cover client request boundaries, owner comparison, and FFprobe output validation. Supabase policy execution, authentication, and storage integration have not been exercised against an external project.
