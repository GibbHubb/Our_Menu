# Vision

## What we are building

A shared kitchen notebook for one household: the recipes we actually cook, a shopping list built from them, and a
pantry, on the phone in the shop and the laptop at home. It is a personal app first and a portfolio piece second.

## Who it is for

Max and Bron, cooking together and shopping from the same list on two phones. A household they invite through a share
code gets the same thing. It is not a public recipe site, a social network or a meal-kit service; the only public
surface is a recipe the owner explicitly shares, with a guestbook.

## Why it matters

The household's recipes come from many sites and cookbooks, and turning a week of them into one shopping list is
manual work. Max's own brief for the shopping list (2026-08-25, quoted in `020_shopping_list.sql`): "you select a dish
and how many servings and it will just tell you how much of each you will need". Building it for real use also keeps
it honest as a portfolio project: two real users, 96 real recipes and a real production database.

## What success looks like

- Picking dinner, putting its ingredients on the list and ticking them off in the shop happens in the app, not around
  it.
- Both phones see the same list, including in a shop with no signal.
- Nothing is lost: no recipe or list item silently disappears, and a failure says so.
- It runs on free tiers with no maintenance chores beyond what the keepalive already does.

## Principles

- **Real use over features.** A change ships because Max or Bron hit the problem, and the ticket quotes them.
- **The database enforces access.** RLS is the boundary; the client is never trusted to scope data.
- **Never show a wrong number.** An unknown serving count scales x1, an unparsed quantity stays blank, a failed load
  is not an empty list.
- **Free tier only.** Vercel, Supabase and Gemini free tiers; no paid hosting, no paid API keys.
- **Reversible by default.** Joining a household moves nothing; destructive data changes are guarded and backed up
  first.
