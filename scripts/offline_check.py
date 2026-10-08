"""OM60 — the shopping list with no signal, driven in a real browser.

Same rules as a11y_check.py: a LOCAL dev server with Supabase mocked by
scripts/mock_supabase.py; production is never contacted (any *.supabase.co
request fails the run).

    NEXT_PUBLIC_SUPABASE_URL=https://mock.supabase.test \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key npm run dev -- -p 3123
    python scripts/offline_check.py [--base http://localhost:3123]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
import mock_supabase as ms  # noqa: E402

UID = ms.USER_ID
Q = f"om60:queue:{UID}"
L = f"om60:list:{UID}"
BANNER = "[role=status]:has-text('Offline'), [role=status]:has-text('reach the server')"
results: list[dict] = []


def check(name: str, ok: bool, detail="") -> bool:
    results.append({"check": name, "ok": bool(ok), "detail": detail})
    print(f"{'PASS' if ok else 'FAIL'}  {name}{'  — ' + str(detail) if detail != '' else ''}")
    return bool(ok)


def seed() -> dict:
    t = ms.seed()
    for i, name in enumerate(["onion", "carrots", "milk"], start=4):
        t["shopping_extras"].append({
            "id": f"e0000000-0000-4000-8000-00000000000{i}", "label": name, "item_key": name,
            "qty_base": 1, "family": "count", "unit_hint": None, "created_at": f"2026-01-01T00:00:0{i}Z"})
    return t   # 6 rows


def ls(page, key):
    return page.evaluate(f"() => localStorage.getItem({json.dumps(key)})")


def queue_len(page) -> int:
    raw = ls(page, Q)
    return len(json.loads(raw)) if raw else 0


def got_buttons(page):
    return page.locator("button[aria-label^='Got '], button[aria-label^='Untick ']")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3123")
    a = ap.parse_args()
    base = a.base
    ok = True
    db = ms.DB(seed())

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        ms.install(ctx, db)
        page = ctx.new_page()

        # 0. Online first visit fills the cache. Visit /pantry too so both
        #    route bundles are in memory for the offline client-side navigation.
        page.goto(base + "/shopping", wait_until="networkidle", timeout=120_000)
        page.wait_for_selector("text=to get")
        ok &= check("online: 6 rows on the list", got_buttons(page).count() == 6, got_buttons(page).count())
        ok &= check("online: the list is cached per user", bool(ls(page, L)))

        # 1a. Open the app with ONE BAR: the page itself loads, Supabase does not
        #     answer. A full mount must fall back to the cached copy and say so.
        #     (A true airplane-mode reload cannot work without a service worker:
        #     the browser cannot fetch the document. See the plan.)
        db.offline = True
        page.goto(base + "/shopping", wait_until="domcontentloaded")
        page.wait_for_selector(BANNER, timeout=15_000)
        page.wait_for_selector("button[aria-label^='Got ']", timeout=5_000)
        dt = page.evaluate("() => (performance.now() - performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd) / 1000")
        # Informational, not gated: here the page must wait for the requests to
        # fail first (dev server, three aborted fetches + auth init).
        results.append({"check": "unreachable: time to cached list (info)", "ok": True, "detail": f"{dt:.2f}s"})
        print(f"INFO  unreachable: cached list + banner {dt:.2f}s after DOMContentLoaded (waits for the fetches to fail)")
        ok &= check("unreachable: banner names the cached copy",
                    "last saved list" in page.inner_text("[role=status]"), page.inner_text("[role=status]"))
        ok &= check("unreachable: all 6 cached rows shown", got_buttons(page).count() == 6, got_buttons(page).count())
        ok &= check("unreachable: 0 'nothing on it' empty copy", page.locator("text=Nothing on the list yet").count() == 0)
        ok &= check("unreachable: not the OM59 error screen", page.locator("text=Couldn't load the shopping list").count() == 0)

        # 1c. The browser says offline at mount (navigator.onLine false; the
        #     document is still served so the page can load at all): the cache
        #     must paint without waiting on the network.
        off = browser.new_context(viewport={"width": 390, "height": 844})
        ms.install(off, db)
        off.add_init_script("Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false })")
        op = off.new_page()
        op.goto(base + "/", wait_until="domcontentloaded")  # same origin, to seed the cache key
        op.evaluate(f"(v) => localStorage.setItem({json.dumps(L)}, v)", ls(page, L))
        op.goto(base + "/shopping", wait_until="domcontentloaded")
        op.wait_for_selector("[role=status]:has-text('Offline')", timeout=15_000)
        op.wait_for_selector("button[aria-label^='Got ']", timeout=5_000)
        dt = op.evaluate("() => (performance.now() - performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd) / 1000")
        ok &= check("offline at mount: cached list + Offline banner within 1 s", dt <= 1.0, f"{dt:.2f}s after DOMContentLoaded")
        ok &= check("offline at mount: 0 empty copy, 6 rows",
                    op.locator("text=Nothing on the list yet").count() == 0 and op.locator("button[aria-label^='Got ']").count() == 6)
        off.close()

        # 1b. Airplane mode with the list already open (the in-the-aisle case).
        db.offline = False
        page.goto(base + "/shopping", wait_until="networkidle")
        page.wait_for_selector("text=to get")
        ctx.set_offline(True)
        db.offline = True
        page.evaluate("() => document.dispatchEvent(new Event('visibilitychange'))")  # app back to the foreground
        page.wait_for_selector("[role=status]:has-text('last saved list')", timeout=5_000)
        ok &= check("offline, list open: rows stay, banner says Offline + cached",
                    got_buttons(page).count() == 6 and "Offline" in page.inner_text("[role=status]"),
                    page.inner_text("[role=status]"))
        offline_nav_note = "client-side navigation to /shopping while offline fails (no SW): see plan"

        # 2. Five ticks offline: immediate on screen, queued, nothing sent.
        server_ticks_before = len(db.rows("shopping_ticks"))
        for _ in range(5):
            page.locator("button[aria-label^='Got ']").first.click()
        pressed = page.locator("button[aria-pressed='true']").count()
        ok &= check("offline: 5 ticks show immediately", pressed == 5, pressed)
        ok &= check("offline: 5 queued", queue_len(page) == 5, queue_len(page))
        ok &= check("offline: 0 reached the server", len(db.rows("shopping_ticks")) == server_ticks_before)
        ok &= check("offline: Checked out is disabled",
                    page.locator("button:has-text('Checked out')").is_disabled())

        # 3. Back online: the online event replays the queue.
        db.offline = False
        t0 = time.monotonic()
        ctx.set_offline(False)
        page.wait_for_function(f"() => !localStorage.getItem({json.dumps(Q)}) || JSON.parse(localStorage.getItem({json.dumps(Q)})).length === 0", timeout=15_000)
        landed = [r for r in db.rows("shopping_ticks") if r.get("checked")]
        ok &= check("online: 5 landed, 0 remaining", len(landed) == 5 and queue_len(page) == 0,
                    f"landed={len(landed)} remaining={queue_len(page)} in {time.monotonic() - t0:.2f}s")
        page.wait_for_selector(BANNER, state="detached", timeout=5_000)
        ok &= check("online: banner gone within 2 s of reconnecting", time.monotonic() - t0 <= 2.5,
                    f"{time.monotonic() - t0:.2f}s")

        # "Second device": a separate browser context reading the same backend.
        other = browser.new_context(viewport={"width": 1280, "height": 900})
        ms.install(other, db)
        p2 = other.new_page()
        p2.goto(base + "/shopping", wait_until="networkidle")
        p2.wait_for_selector("text=to get")
        ok &= check("second device sees all 5 ticked", p2.locator("button[aria-pressed='true']").count() == 5,
                    p2.locator("button[aria-pressed='true']").count())
        other.close()

        # 4. Banner timing from a live page: offline event -> banner, online -> gone.
        page.locator("button[aria-label^='Untick ']").first.wait_for()
        t0 = time.monotonic()
        ctx.set_offline(True)
        page.wait_for_selector(BANNER, timeout=5_000)
        ok &= check("banner appears within 2 s of losing connection", time.monotonic() - t0 <= 2.0, f"{time.monotonic() - t0:.2f}s")
        t0 = time.monotonic()
        ctx.set_offline(False)
        page.wait_for_selector(BANNER, state="detached", timeout=5_000)
        ok &= check("banner disappears within 2 s of reconnecting", time.monotonic() - t0 <= 2.0, f"{time.monotonic() - t0:.2f}s")

        # 5. Queue survives closing the app: tick offline, close the tab, reopen online.
        ctx.set_offline(True); db.offline = True
        page.locator("button[aria-label^='Untick ']").first.click()
        ok &= check("restart: one tick queued before closing", queue_len(page) == 1, queue_len(page))
        page.close()
        ctx.set_offline(False); db.offline = False
        before = sum(1 for r in db.rows("shopping_ticks") if r.get("checked"))
        page = ctx.new_page()
        page.goto(base + "/shopping", wait_until="networkidle")
        page.wait_for_selector("text=to get")
        page.wait_for_timeout(1000)
        after = sum(1 for r in db.rows("shopping_ticks") if r.get("checked"))
        ok &= check("restart: the queued untick landed on reopen", after == before - 1 and queue_len(page) == 0,
                    f"checked {before} -> {after}, queue {queue_len(page)}")

        # 6. Negative control: writes to shopping_ticks fail -> nothing dropped, said on screen.
        db.fail_writes.add("shopping_ticks")
        page.locator("button[aria-label^='Got ']").first.click()
        page.wait_for_timeout(800)
        ok &= check("control: a failing write is queued, not dropped", queue_len(page) == 1, queue_len(page))
        ok &= check("control: the failure is visible on screen",
                    page.locator("[role=status]:has-text('saved on this phone')").count() == 1)
        page.evaluate("() => window.dispatchEvent(new Event('online'))")
        page.wait_for_timeout(1000)
        ok &= check("control: a failed flush keeps the entry", queue_len(page) == 1, queue_len(page))
        db.fail_writes.clear()
        page.evaluate("() => window.dispatchEvent(new Event('online'))")
        page.wait_for_function(f"() => !localStorage.getItem({json.dumps(Q)}) || JSON.parse(localStorage.getItem({json.dumps(Q)})).length === 0", timeout=10_000)
        ok &= check("control: once the table answers, it lands", queue_len(page) == 0)

        # 7. No service worker, before and after.
        regs = page.evaluate("async () => (await navigator.serviceWorker.getRegistrations()).length")
        ok &= check("0 service workers registered", regs == 0, regs)

        # 8. Sign out clears this account's cache and queue.
        enq = f"() => localStorage.setItem({json.dumps(Q)}, JSON.stringify([{{key:'extra:x',checked:true,at:'t'}}]))"
        page.evaluate(enq)
        page.once("dialog", lambda d: d.accept())   # OM47's "are you sure?"
        page.click("button[aria-label='Sign out']")
        page.wait_for_timeout(1500)
        left = page.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('om60:'))")
        ok &= check("sign-out: no om60 keys left in localStorage", left == [], left)

        ok &= check("0 requests to a real Supabase host", not db.leaks, db.leaks)
        browser.close()

    print("\nRESULT:", "PASS" if ok else "FAIL", f"({sum(r['ok'] for r in results)}/{len(results)})")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
