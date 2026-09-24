"""OM61 — daily synthetic check, run by .github/workflows/synthetic.yml.

Self-contained in THIS repo on purpose: the workflow that runs it lives here
too, and a GitHub Actions job in Our_Menu has no access to backlog_bandit's
private repo without a second cross-repo credential. The on-demand,
verify_lib-based twin of this script is
`backlog_bandit/scripts/ourmenu_synthetic.py` — same four surfaces, same
negative control, meant for a person to run locally and get the full BB18
UNPROVEN/PASS/FAIL vocabulary. This copy carries the same discipline (a tiny
inline Checker below) without the cross-repo dependency.

Surfaces checked:
    /api/health   — asserted on the BODY (ok === true, checks.db === 'up')
    grid (/)      — recipe cards render for the signed-in user
    /shopping     — the page's own chrome renders, not the ErrorBoundary screen
    a recipe page — a known recipe's own title/servings slider renders

Auth: mints a real magic link via the Supabase admin API (does not send an
email, does not touch the 2-emails/hour limit) — the same technique
backlog_bandit/scripts/ourmenu_verify.py already uses in production.

Env required (see .github/workflows/synthetic.yml):
    SUPABASE_SERVICE_ROLE_KEY  — GitHub Actions secret, Max sets this
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid

from playwright.sync_api import sync_playwright

APP = "https://our-menu-omega.vercel.app"
PROJ = "qzgrukdwukkcghacolua"
EMAIL = "max-gibson1997@hotmail.com"

SRK = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not SRK:
    print("SUPABASE_SERVICE_ROLE_KEY is not set — see .github/workflows/synthetic.yml")
    sys.exit(3)


class Checker:
    """Minimal PASS/FAIL/UNPROVEN checker — see scripts/verify_lib.py in
    backlog_bandit for the full version and the rationale (BB18/F-GREENBLIND):
    a green run must prove it could have gone red, or it counts for nothing.
    """

    def __init__(self):
        self.checks = []
        self.controls = []

    def check(self, label, ok, detail=""):
        ok = bool(ok)
        self.checks.append((label, ok))
        print(("  PASS  " if ok else "  FAIL  ") + label + (f"  - {detail}" if detail else ""))
        return ok

    def control(self, label, ok, detail=""):
        fired = not bool(ok)
        self.controls.append((label, fired))
        print(("  CTRL  " if fired else "  BLIND ") + label + (f"  - {detail}" if detail else ""))
        return fired

    def finish(self):
        failed = [n for n, ok in self.checks if not ok]
        blind = [n for n, fired in self.controls if not fired]
        proved = sum(1 for _, fired in self.controls if fired)
        if failed or blind:
            verdict = "FAIL"
        elif not self.checks or proved == 0:
            verdict = "UNPROVEN"
        else:
            verdict = "PASS"
        print(f"\n{sum(1 for _, ok in self.checks if ok)}/{len(self.checks)} checks passed | "
              f"{proved} control(s) proved-failing | verdict {verdict}")
        if failed:
            print("FAILED: " + ", ".join(failed))
        if blind:
            print("BLIND CONTROL(S): " + ", ".join(blind))
        return {"PASS": 0, "FAIL": 1, "UNPROVEN": 3}[verdict]


v = Checker()


def mint_link() -> str:
    req = urllib.request.Request(
        f"https://{PROJ}.supabase.co/auth/v1/admin/generate_link",
        data=json.dumps({"type": "magiclink", "email": EMAIL}).encode(),
        headers={"Content-Type": "application/json", "apikey": SRK, "Authorization": f"Bearer {SRK}"},
    )
    return json.loads(urllib.request.urlopen(req, timeout=30).read())["action_link"]


# ── 1. /api/health — asserted on the body, not just the status code ────────
try:
    with urllib.request.urlopen(f"{APP}/api/health", timeout=20) as resp:
        status = resp.status
        health = json.loads(resp.read())
except urllib.error.HTTPError as e:
    status = e.code
    try:
        health = json.loads(e.read())
    except Exception:
        health = {}
except Exception as e:
    status = 0
    health = {"error": str(e)}

v.check("/api/health returns HTTP 200", status == 200, f"HTTP {status}")
v.check("/api/health body says ok === true", health.get("ok") is True, json.dumps(health)[:200])
v.check("/api/health checks.db === 'up'", (health.get("checks") or {}).get("db") == "up",
        json.dumps(health.get("checks"))[:200])

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 1000})

    page.goto(mint_link(), wait_until="domcontentloaded")
    page.wait_for_timeout(4000)

    # ── 2. grid page ─────────────────────────────────────────────────────
    page.goto(f"{APP}/", wait_until="networkidle")
    page.wait_for_timeout(2500)
    cards = page.locator("a[href^='/recipe/']")
    n_cards = cards.count()
    v.check("grid page renders recipe cards for the signed-in user", n_cards > 0, f"{n_cards} cards")
    recipe_href = cards.first.get_attribute("href") if n_cards else None

    # ── 3. /shopping — its own chrome, not the ErrorBoundary screen ────────
    page.goto(f"{APP}/shopping", wait_until="networkidle")
    page.wait_for_timeout(2500)
    body = page.inner_text("body")
    v.check("/shopping renders its own chrome (add-extra input present)",
            page.get_by_placeholder(re.compile("add something else", re.I)).count() > 0,
            "placeholder found" if "Add something else" in body else "placeholder missing")
    v.check("/shopping does not show the ErrorBoundary screen",
            "Something went wrong" not in body, body[:120])

    # ── 4. a recipe detail page — known title renders ───────────────────────
    if recipe_href:
        page.goto(f"{APP}{recipe_href}", wait_until="networkidle")
        page.wait_for_timeout(2000)
        detail_body = page.inner_text("body")
        v.check("recipe detail page renders (servings slider present)",
                page.locator("#servings-slider").count() > 0,
                "slider found" if "servings-slider" in page.content() else "slider missing")
        v.check("recipe detail page does not show 'Recipe Not Found'",
                "Recipe Not Found" not in detail_body, detail_body[:80])
    else:
        v.check("recipe detail page renders (servings slider present)", False, "no recipe card to click through")
        v.check("recipe detail page does not show 'Recipe Not Found'", False, "no recipe card to click through")

    # ── negative control — same route, a UUID that cannot exist ────────────
    bogus_id = str(uuid.uuid4())
    page.goto(f"{APP}/recipe/{bogus_id}", wait_until="networkidle")
    page.wait_for_timeout(2000)
    control_body = page.inner_text("body")
    looks_like_a_working_recipe_page = (
        "Recipe Not Found" not in control_body and page.locator("#servings-slider").count() > 0
    )
    v.control("a nonexistent recipe id does NOT render as a working recipe page",
              looks_like_a_working_recipe_page, control_body[:80])

    browser.close()

sys.exit(v.finish())
