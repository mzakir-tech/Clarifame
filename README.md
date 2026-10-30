# ClariFrame AI

ClariFrame is a private video-restoration studio for everyday footage. The root route is a continuous, anchor-navigated page for the landing story, video workspace, finishing room, and account area. Supabase email/password authentication and signed private uploads are available after the required project configuration and migration are applied. AI jobs, inference, and output delivery are not connected yet.

## Run locally

Requirements: Node.js 20.9 or newer.

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. The file chooser supports MP4, MOV, and WebM clips up to 500 MiB and 60 seconds. Browser validation is only a usability check; the signed-in upload endpoint independently enforces the byte limit and FFprobe verifies actual media before the upload is marked accepted.

To enable authentication, copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL` from your app and Supabase project. Allow `${NEXT_PUBLIC_SITE_URL}/auth/confirm` in the Supabase Auth redirect URL settings. The root page verifies the current user on the server and shows account forms or the verified session inline.

Private uploads also require applying `supabase/migrations/202610200001_video_uploads.sql`, setting the server-only `SUPABASE_SERVICE_ROLE_KEY`, and installing FFprobe on the server. Set `FFPROBE_PATH` to its executable when it is not on `PATH`. Never prefix the service-role key with `NEXT_PUBLIC_`. Uploads use signed resumable URLs and are not accepted into the library until server-side FFprobe inspection verifies the actual media. `vercel.json` schedules cleanup hourly; set `CRON_SECRET` in Vercel project settings and redeploy. On other hosts, schedule `GET /api/cron/cleanup-uploads` with `Authorization: Bearer <CRON_SECRET>` hourly. There is no AI job or inference pipeline yet.

## Deploy on Netlify

Import the GitHub repository `mzakir-tech/Clarifame` as a new Netlify site. The root `netlify.toml` configures the Node.js build, runs the tests, lint, and type checks, and then builds the Next.js application. After Netlify assigns the site URL, add these variables in the site's environment settings and redeploy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL` (the final Netlify site URL)

Email confirmation also requires allowing `${NEXT_PUBLIC_SITE_URL}/auth/confirm` in Supabase Auth redirect URLs. For private uploads, the Supabase project must be active and the SQL migration above must be applied. Add `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` as server-only Netlify variables. The deployment must include a compatible FFprobe binary and set `FFPROBE_PATH` to that binary; a local Windows path is not usable in Netlify's Linux runtime. Netlify does not run the Vercel schedule in `vercel.json`, so configure an hourly scheduler for `/api/cron/cleanup-uploads` with the bearer secret if cleanup is enabled. AI processing remains unavailable until a real worker and model are deployed.

## Available checks

```sh
npm run lint
npm run typecheck
npm run build
npm test
npm audit
```

The tests cover the shared MIME and byte-size limits, ownership and request validation helpers, and FFprobe metadata parsing. Supabase RLS, Storage, Auth, and real FFprobe integration still require configured services and manual verification.

## Project decisions

See [docs/architecture.md](docs/architecture.md) for the service boundaries, first AI proof-of-concept direction, acceptance criteria, and unresolved choices. See [AGENTS.md](AGENTS.md) for durable contributor guidance.
