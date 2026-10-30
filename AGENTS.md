# ClariFrame AI project guide

## Product and architecture
- Build a private video-restoration studio for source clips up to 60 seconds.
- Keep the Next.js/TypeScript web application, Supabase Auth/Postgres, private object storage, and Python/FFmpeg AI worker as separate responsibilities.
- Never claim model processing is available unless a real worker integration is connected and verified. Do not fabricate jobs, progress, or results.
- Treat upload validation in the browser as usability support only; server-side validation remains mandatory before accepting work.

## Development
- Work in small stages and preserve existing behavior.
- Keep interface controls operational or clearly disabled with a reason.
- Prefer accessible native controls, responsive layouts, and reduced-motion support.
- Run focused checks when requested; report the actual outcome and any missing integrations.
- Record durable architecture decisions in `docs/architecture.md`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
