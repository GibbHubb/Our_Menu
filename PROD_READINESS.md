# Our_Menu — Prod Readiness

Stack: Next.js 14 · TypeScript · Supabase · Tailwind · Framer Motion · Claude API

## Tasks (ordered — do 1/day)

### 1. Server Components + Server Actions refactor
Showcase: modern Next 14 App Router mastery.
- Audit all `"use client"` components — push data fetching to RSC where possible
- Convert mutations to Server Actions with `zod` validation + `useActionState`
- Streaming UI with `<Suspense>` + skeletons for recipe list, AI chat
- `generateMetadata` per route for SEO + OG tags
- Lighthouse >= 95 on all four metrics, evidence in README

### 2. Supabase RLS + typed client
Showcase: multi-tenant security understanding.
- Row-Level Security policies per table — user can only see Bron/Max shared scope
- Generate TS types from schema (`supabase gen types`), CI-checked for drift
- Service-role key server-only; anon key only in client
- Middleware-based route protection + session refresh hooks

### 3. Claude API cost/reliability layer
Showcase: production LLM engineering.
- Streaming responses via Vercel AI SDK, cancellable from UI
- Prompt caching on system prompt + recipe context (cache_control breakpoints)
- Retry with exponential backoff on 429/529, circuit breaker per user
- Token usage logged to Supabase, daily cost dashboard page
- Evals: small recipe-extraction dataset run in CI, regression thresholds
