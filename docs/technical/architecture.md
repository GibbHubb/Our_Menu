# Architecture

## System overview

Our_Menu is a recipe box, shopping list and pantry for one household (Max and Bron), built as a Next.js 16 App Router
app on Vercel's free tier. The browser talks to Supabase directly for most reads and writes, using the publishable
(anon) key plus the signed-in user's session, so Postgres Row Level Security is the real access boundary. A small set
of Next route handlers under `src/app/api/` do the things a browser cannot: LLM calls, scraping a recipe URL, health
checks. Those handlers act **as the caller** by forwarding the caller's access token. The database is the `public`
schema of a Supabase project shared with other apps (see `data-model.md`).

## Diagram

```
 phone / laptop browser
   │  React client components (most pages are "use client")
   │  supabase-js  (anon key + session in localStorage, implicit flow)
   │
   ├──────────────► Supabase (shared free project, schema `public`)
   │                  Postgres + RLS · Auth (magic link) · Storage (recipe-images)
   │                        ▲
   │  apiFetch() adds        │ request-scoped client, anon key + caller's JWT
   │  Authorization: Bearer  │ (createRequestClient) → RLS evaluates as the caller
   ▼                         │
 Vercel (region dub1) ── Next 16 route handlers /api/* ──┘
                              │
                              └──► Gemini, OpenAI-compatible endpoint (src/lib/llm.ts)

 Vercel cron  06:00 UTC daily ──► /api/keepalive ─┐
 GitHub Actions keepalive.yml every 3rd day ──────┤  keep the Supabase project inside
 GitHub Actions synthetic.yml daily ──► signed-in │  its 7-day inactivity window, and
   browser check + /api/health body               ┘  prove the app actually renders
```

## Components

| Component | Responsibility | Tech |
|-----------|----------------|------|
| Pages (`src/app/*`) | recipe grid, recipe detail, shopping list, pantry, meal plan, households, `/join/[code]`, public share `/r/[id]`, login and auth callback | Next 16 App Router, React 19, Tailwind, Framer Motion |
| `src/lib/supabaseClient.ts` | the one browser Supabase client; `flowType: 'implicit'` | `@supabase/supabase-js` 2 |
| `src/lib/apiFetch.ts` | the one place that attaches the caller's access token to `/api/*` calls | fetch wrapper |
| `src/lib/supabaseServer.ts` | `createRequestClient(req)` (anon key + caller JWT), `getRequestUser(req)` (verifies the token with Supabase Auth), `createAdminClient()` (service role, batch jobs only) | supabase-js |
| Route handlers (`src/app/api/*`) | `chat`, `substitutions`, `nutrition/[id]`, `meal-plan/{generate,save}`, `receipts/scan`, `import-url`, `recipes/{[id],embed,search}`, `ai-status`, `health`, `keepalive`, `client-error` | Next route handlers |
| `src/lib/embeddings.ts` | Gemini `embedContent` for semantic search (OM68) | fetch |
| `src/lib/llm.ts` | which LLM the app talks to: Gemini free tier through its OpenAI-compatible endpoint (`GEMINI_API_KEY`, `LLM_MODEL`) | fetch |
| `src/lib/offline.ts` | shopping list cache-on-read and tick queue-on-write when the signal drops; no service worker on purpose | localStorage |
| Database | tables, RLS, household stamping trigger, SECURITY DEFINER household RPCs | Postgres on Supabase, `supabase/migrations/` |

`recipes/embed` and `recipes/search` use Gemini embeddings (`src/lib/embeddings.ts`: `gemini-embedding-001` at 1536
dimensions to fit `recipe_embeddings.embedding vector(1536)`, `GEMINI_API_KEY`). OM68 removed the OpenAI SDK and key.
The semantic search bar is still hidden by the `ai-status` flag, which only checks `ANTHROPIC_API_KEY`.

## Key flows

**Sign-in (magic link, implicit flow).** `/login` calls `signInWithOtp`. The emailed link returns the tokens in the URL
**hash**, and `/auth/callback` lets supabase-js pick them up (`detectSessionInUrl`). Implicit, not PKCE, is deliberate:
PKCE keeps a code verifier in the requesting browser's localStorage, so a link opened from the Gmail app or a second
device failed with "PKCE code verifier not found". The constraint this creates: the session lives in **localStorage**,
not cookies, so server code cannot see who is signed in unless the client sends the token. On first sign-in
`claim_orphan_data()` and `ensure_household()` give the user a household.

**API token forwarding.** A client component calls `apiFetch('/api/...')`, which adds `Authorization: Bearer
<access_token>`. The handler builds `createRequestClient(req)`: anon key, the caller's JWT, no session persistence. RLS
then runs as that user and `auth.uid()` resolves inside policies. Handlers that must be signed-in call
`getRequestUser(req)` and answer 401 without it. The service role is never used on behalf of a request.

**Shopping list.** Pressing Add on a recipe copies the ticked, servings-scaled ingredient lines into `shopping_extras`,
merging by `item_key` within a unit family. Ticks are upserts into `shopping_ticks` keyed by line, stamped with the
server clock. Offline, ticks queue locally and replay when the connection returns.

## Cross-cutting concerns

- **Auth and authorisation:** Supabase Auth for identity, RLS for every access decision; household membership is the
  boundary (`data-model.md`). No route trusts a client-sent user id.
- **Config and secrets:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public by design),
  `SUPABASE_SERVICE_ROLE_KEY` (server only, batch jobs), `GEMINI_API_KEY`, optional `LLM_API_BASE` / `LLM_MODEL`,
  optional `CRON_SECRET`. Set in Vercel project settings and `.env.local`, which is gitignored.
- **Errors:** no `alert()` boxes (OM59); error and not-found pages; a failed load is shown as a failure, never as an
  empty list. Browser errors are posted to `/api/client-error` and land in the write-only `client_errors` table.
- **Observability:** `/api/health` touches the database and can go red; `synthetic.yml` drives four real pages in a
  signed-in browser daily (needs the `SUPABASE_SERVICE_ROLE_KEY` repo secret).
- **Accessibility:** one `Modal` wrapper for dialog semantics; axe serious/critical = 0 on four routes (OM58).

## Deployment topology

| Piece | Where |
|---|---|
| App | Vercel free tier, production at `our-menu-omega.vercel.app`, function region `dub1` (near the eu-west-1 database). Deploys from `main` on GitHub `GibbHubb/Our_Menu`. |
| Database, Auth, Storage | Supabase free tier, project `qzgrukdwukkcghacolua`, schema `public` (shared project: `cortana`, `poly`, `finly`, `ai_path` belong to other apps; `auth.users` is shared). |
| Schema changes | applied by hand from `supabase/migrations/`, see `data-model.md` § Migrations |
| CI | GitHub Actions `ci.yml` on every push: `npm ci`, typecheck, lint (0 warnings), `vitest`, control tests, `next build` |
| Keepalive | Vercel cron (`vercel.json`, daily) plus `keepalive.yml` (every third day) hitting `/api/keepalive`, so a paused free project never takes the app down |
| Synthetic check | `synthetic.yml`, daily |
| LLM | Gemini free tier via HTTPS; no paid keys |
