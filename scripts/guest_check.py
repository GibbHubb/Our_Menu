"""OM70 — signed-out walkthrough of the demo kitchen.

Usage:  python scripts/guest_check.py <base-url> [--old <url-of-pre-OM70-build>]

Checks (AC1-AC4 of plans/our_menu/OM70.md):
  AC1  home shows the demo cards + the demo banner, never the "Sign in to see your menu" wall
  AC2  a demo recipe page renders its title and the "Demo recipe." note
  AC3  the picker opens and shows a demo recipe
  AC4  no edit pencil, no chat button, "Add recipe" answers with a log-in toast, and NOT ONE request in the
       whole walkthrough goes to Supabase tables (/rest/v1/) or to /api/chat

Controls (a check that cannot fail proves nothing):
  C1   a deliberate fetch to /rest/v1/ from the same page must be caught by the same network detector
  C2   with --old, the pre-OM70 build's signed-out home MUST show a /rest/v1/recipes request
Exit 0 only if every check and every control passes.
"""
import re
import sys

from playwright.sync_api import sync_playwright

FORBIDDEN = re.compile(r"/rest/v1/|/api/chat")


def run(base: str, old: str | None) -> int:
    results: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        results.append((name, ok, detail))

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context()  # fresh context = signed out, no stored session
        page = ctx.new_page()
        seen: list[str] = []
        page.on("request", lambda r: seen.append(r.url))

        # AC1 — home
        page.goto(base + "/", wait_until="networkidle")
        page.wait_for_selector('a[href^="/recipe/demo-"]', timeout=20000)
        cards = page.locator('a[href^="/recipe/demo-"]')
        n = cards.count()
        check("AC1 demo cards shown", n >= 20, f"{n} cards")
        check("AC1 demo banner shown", page.get_by_text("You're looking at a demo kitchen.").count() == 1)
        check("AC1 no sign-in wall", page.get_by_text("Sign in to see your menu").count() == 0)
        check("AC1 banner has Log in", page.get_by_role("link", name="Log in").count() >= 1)

        # AC4 — guest UI
        check("AC4 no edit pencil", page.get_by_role("button", name="Edit recipe").count() == 0)
        check("AC4 no chat button", page.get_by_role("button", name="AI kitchen assistant").count() == 0)
        page.get_by_role("button", name="Add recipe").click()
        page.wait_for_timeout(500)
        check("AC4 add -> log-in toast", page.get_by_text("Log in to add your own recipes").count() >= 1)

        # AC1 — a search that matches nothing shows "Nothing matches", never the sign-in wall
        page.get_by_placeholder("What are we craving?").fill("zzqqxx-no-such-dish")
        page.wait_for_timeout(600)
        check("AC1 zero-match search -> 'Nothing matches'",
              page.get_by_text("Nothing matches those filters").count() == 1
              and page.get_by_text("Sign in to see your menu").count() == 0)
        page.get_by_placeholder("What are we craving?").fill("")
        page.wait_for_timeout(400)

        # AC3 — picker
        page.get_by_role("button", name="Pick a recipe for us").click()
        page.get_by_text("Spin Again").wait_for(timeout=10000)
        page.wait_for_timeout(2500)  # let the spin settle
        # Only links INSIDE the picker dialog count; the grid behind it is full of demo links.
        picked = page.locator('[role="dialog"] a[href^="/recipe/demo-"]')
        check("AC3 picker shows a demo recipe", picked.count() == 1,
              (picked.first.get_attribute("href") or "") if picked.count() else "none in dialog")
        page.get_by_text("Nah, close").click()

        # AC2 — demo recipe page
        first = cards.first
        href = first.get_attribute("href") or ""
        page.goto(base + href, wait_until="networkidle")
        h1 = page.locator("h1").first.inner_text(timeout=10000)
        check("AC2 recipe page renders", bool(h1.strip()) and page.get_by_text("Demo recipe.").count() == 1, f"{href} -> {h1!r}")
        check("AC2 no edit on recipe page", page.get_by_role("button", name="Edit recipe").count() == 0)

        # AC4 — household pages: the Pantry tab and the direct URLs send a guest to log in
        page.goto(base + "/", wait_until="networkidle")
        page.get_by_role("link", name="Pantry").first.click()
        try:
            page.wait_for_url(re.compile(r"/login"), timeout=10000)
        except Exception:
            pass
        page.wait_for_load_state("networkidle")
        check("AC4 Pantry tab -> /login", "/login" in page.url, page.url)
        for path in ("/pantry", "/meal-plan", "/shopping"):
            page.goto(base + path)
            try:
                page.wait_for_url(re.compile(r"/login"), timeout=10000)
            except Exception:
                pass
            page.wait_for_load_state("networkidle")
            check(f"AC4 {path} -> /login", "/login" in page.url, page.url)

        # AC4 — the network assertion over the whole walkthrough
        bad = [u for u in seen if FORBIDDEN.search(u)]
        check("AC4 zero /rest/v1/ or /api/chat requests", not bad, f"{len(seen)} requests, forbidden: {bad[:3]}")

        # C1 — the detector catches a deliberate table request from the same page
        before = len(seen)
        page.evaluate(
            """async (u) => { try { await fetch(u); } catch (e) {} }""",
            "https://qzgrukdwukkcghacolua.supabase.co/rest/v1/recipes?select=id&limit=1",
        )
        page.wait_for_timeout(1500)
        caught = [u for u in seen[before:] if FORBIDDEN.search(u)]
        check("C1 detector catches a deliberate /rest/v1/ request", bool(caught))

        # C2 — the old build really did query Supabase for a guest (the check is red on old code).
        # Mandatory: without it this run proves nothing about the detector on a real app path.
        if not old:
            check("C2 pre-OM70 control", False, "SKIPPED: pass --old <pre-OM70 url>")
        else:
            old_page = browser.new_context().new_page()
            old_seen: list[str] = []
            old_page.on("request", lambda r: old_seen.append(r.url))
            old_page.goto(old + "/", wait_until="networkidle")
            old_page.wait_for_timeout(2000)
            check("C2 pre-OM70 build queries /rest/v1/recipes signed out",
                  any("/rest/v1/recipes" in u for u in old_seen))

        browser.close()

    width = max(len(n) for n, _, _ in results)
    for name, ok, detail in results:
        print(f"{'PASS' if ok else 'FAIL'}  {name.ljust(width)}  {detail}")
    failed = [n for n, ok, _ in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)
    base = args[0].rstrip("/")
    old = args[args.index("--old") + 1].rstrip("/") if "--old" in args else None
    sys.exit(run(base, old))
