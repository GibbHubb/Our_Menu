// OM48 — setting your own password.
//
// OM47 gave the app a password field but no way to fill the other side of it:
// `signInWithPassword` was the only password API in the repo, so the two
// passwords that existed were set by an admin script and nobody could change
// them. A third person joining got a login form they could never satisfy.
//
// Deliberately NOT a security module. Max, 2026-08-27: "this is personal and
// doesn't really matter if it gets hacked, it's a menu." The minimum below is
// Supabase's own project setting, not an opinion — a form that rejects what
// the server would accept is just a worse error message.

// Matches `password_min_length` on the Supabase project. If that is ever
// raised, raise this too or the server rejects what this form accepted.
export const PASSWORD_MIN = 6;

// Whether to offer "set a password" after a magic-link sign-in.
//
// There is no client-side way to ask Supabase "does this user have a
// password?" — the user object does not carry it. So rather than nag on
// every link sign-in, the offer is remembered per user per browser: shown
// once, and never again once it is taken or waved off. Being wrong here is
// cheap in one direction (a prompt someone dismisses) and annoying in the
// other, which is why it errs towards silence.
const KEY = "om-password-offer-v1";

// Three outcomes, and they must stay distinct: a stored answer, no answer
// yet, and storage we cannot read at all. Collapsing the last two into null
// is what would make the offer un-dismissable in private mode — it would be
// re-asked on every single sign-in with no way to ever answer it.
const UNREADABLE = Symbol("unreadable");

function safeGet(k: string): string | null | typeof UNREADABLE {
  if (typeof window === "undefined") return UNREADABLE;
  try {
    return localStorage.getItem(k);
  } catch {
    return UNREADABLE; // private mode, blocked storage
  }
}

function safeSet(k: string, v: string) {
  try {
    if (typeof window !== "undefined") localStorage.setItem(k, v);
  } catch {
    /* nothing to do — the offer just reappears next time */
  }
}

export function shouldOfferPassword(userId: string | undefined): boolean {
  if (!userId) return false;
  // Only a readable, empty slot means "not asked yet". If storage cannot be
  // read we stay quiet: an offer nobody can dismiss is worse than one nobody
  // sees, and the household page can set a password at any time regardless.
  return safeGet(`${KEY}:${userId}`) === null;
}

/** They actually saved one. */
export function markPasswordSet(userId: string | undefined) {
  if (userId) safeSet(`${KEY}:${userId}`, "set");
}

/** They waved it off. */
export function markPasswordOfferDismissed(userId: string | undefined) {
  if (userId) safeSet(`${KEY}:${userId}`, "dismissed");
}

/** They tapped through to the form. Recorded even though they may not finish:
 *  the question has been asked, and re-asking on every future sign-in for
 *  someone who walked away mid-form is the more annoying failure. The form
 *  itself stays available on the household page. */
export function markPasswordOfferTaken(userId: string | undefined) {
  if (userId) safeSet(`${KEY}:${userId}`, "taken");
}
