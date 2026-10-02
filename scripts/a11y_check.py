"""OM58 — axe + dialog + keyboard checks against a LOCAL app with Supabase mocked.

Never contacts production: every Supabase request is answered by
scripts/mock_supabase.py, and any request to a real *.supabase.co host is
aborted and fails the run (`leaks`).

    # terminal 1
    NEXT_PUBLIC_SUPABASE_URL=https://mock.supabase.test \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key npm run dev -- -p 3123
    # terminal 2
    python scripts/a11y_check.py [--base http://localhost:3123] [--json out.json]

Exit 0 only if: 0 serious/critical axe violations on the four routes, every
route rendered its known element first (so a clean axe run cannot be a blank
page), the positive control was flagged, the 3 dialogs pass, and 0 leaks.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
import mock_supabase as ms  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
AXE = (ROOT / "node_modules" / "axe-core" / "axe.min.js").read_text(encoding="utf-8")
RECIPE = ms.seed()["recipes"][0]

ROUTES = [
    ("/", "text=Tomato Pasta"),
    (f"/recipe/{RECIPE['id']}", "text=Chef's Notes"),
    ("/shopping", "text=to get"),
    ("/pantry", "text=Start from a standard pantry"),
]


def run_axe(page) -> list[dict]:
    page.add_script_tag(content=AXE)
    res = page.evaluate("async () => (await axe.run(document, {resultTypes: ['violations']})).violations")
    return [
        {"id": v["id"], "impact": v["impact"], "help": v["help"],
         "nodes": [n["target"][0] if n["target"] else "" for n in v["nodes"]][:12], "count": len(v["nodes"])}
        for v in res
    ]


def serious(vs):
    return [v for v in vs if v["impact"] in ("serious", "critical")]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3123")
    ap.add_argument("--json")
    ap.add_argument("--routes-only", action="store_true")
    a = ap.parse_args()

    results: dict = {"routes": {}, "control": None, "dialogs": {}, "focus_ring": {}, "leaks": []}
    ok = True
    db = ms.DB(ms.seed())
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        ms.install(ctx, db)
        page = ctx.new_page()

        for path, marker in ROUTES:
            page.goto(a.base + path, wait_until="networkidle", timeout=120_000)
            page.wait_for_selector(marker, timeout=60_000)
            vs = run_axe(page)
            results["routes"][path] = vs
            s = serious(vs)
            print(f"{'PASS' if not s else 'FAIL'}  axe {path}: {len(s)} serious/critical, {len(vs)} total")
            for v in vs:
                print(f"        [{v['impact']}] {v['id']} x{v['count']}: {', '.join(map(str, v['nodes'][:6]))}")
            ok &= not s

        # Positive control: an unnamed icon button must be flagged by the same run.
        page.goto(a.base + "/", wait_until="networkidle")
        page.wait_for_selector(ROUTES[0][1])
        page.evaluate("""() => { const b = document.createElement('button');
            b.innerHTML = '<svg width=10 height=10></svg>'; b.id = 'om58-control';
            document.body.appendChild(b); }""")
        flagged = any(v["id"] == "button-name" and any("om58-control" in str(n) for n in v["nodes"])
                      for v in run_axe(page))
        results["control"] = flagged
        print(f"{'PASS' if flagged else 'FAIL'}  control: an injected unnamed button is flagged by axe")
        ok &= flagged

        if not a.routes_only:
            ok &= check_dialogs(page, a.base, results)
            ok &= check_focus_ring(page, a.base, results)
            ok &= check_keyboard_flow(browser, page, a.base, db, results)

        results["leaks"] = db.leaks
        print(f"{'PASS' if not db.leaks else 'FAIL'}  0 requests to a real Supabase host ({len(db.leaks)})")
        ok &= not db.leaks
        browser.close()

    if a.json:
        Path(a.json).write_text(json.dumps(results, indent=2), encoding="utf-8")
    print("\nRESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


DIALOG_JS = """() => { const d = document.querySelector('[role=dialog]'); if (!d) return null;
  const id = d.getAttribute('aria-labelledby'); const h = id && document.getElementById(id);
  return { modal: d.getAttribute('aria-modal'), label: h ? h.textContent.trim() : null,
           focusInside: d.contains(document.activeElement) }; }"""


def _dialog_cycle(page, open_fn, name: str, results) -> bool:
    open_fn()
    try:
        page.wait_for_selector("[role=dialog]", timeout=15_000)
    except Exception:
        results["dialogs"][name] = {"error": "no [role=dialog] appeared"}
        print(f"FAIL  dialog {name}: no [role=dialog] appeared after activating the trigger")
        page.keyboard.press("Escape")
        return False
    trigger_id = page.evaluate("() => window.__om58Trigger || null")
    info = page.evaluate(DIALOG_JS)
    dvs = serious(run_axe(page))
    if dvs:
        print(f"        axe inside {name}: " + "; ".join(f"[{v['impact']}] {v['id']} x{v['count']}: {v['nodes'][:4]}" for v in dvs))
    results.setdefault("dialog_axe", {})[name] = dvs
    # Tab 40 times; focus must never leave the dialog.
    escaped = 0
    for _ in range(40):
        page.keyboard.press("Tab")
        if not page.evaluate("() => document.querySelector('[role=dialog]').contains(document.activeElement)"):
            escaped += 1
    page.keyboard.press("Shift+Tab")
    back_inside = page.evaluate("() => document.querySelector('[role=dialog]').contains(document.activeElement)")
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    closed = page.evaluate("() => !document.querySelector('[role=dialog]')")
    restored = page.evaluate("() => document.activeElement && document.activeElement.dataset.om58Trigger === '1'")
    good = bool(not dvs and info and info["modal"] == "true" and info["label"] and info["focusInside"]
                and escaped == 0 and back_inside and closed and restored)
    results["dialogs"][name] = dict(info or {}, tab_escapes=escaped, shift_tab_inside=back_inside,
                                    escape_closes=closed, focus_restored=restored, trigger=trigger_id)
    print(f"{'PASS' if good else 'FAIL'}  dialog {name}: {results['dialogs'][name]}")
    return good


def _mark_and_press(page, locator):
    el = page.locator(locator).first
    el.evaluate("e => { document.querySelectorAll('[data-om58-trigger]').forEach(x => delete x.dataset.om58Trigger); e.dataset.om58Trigger = '1'; }")
    el.focus()
    page.keyboard.press("Enter")


def check_dialogs(page, base, results) -> bool:
    ok = True
    page.goto(base + "/", wait_until="networkidle")
    page.wait_for_selector(ROUTES[0][1])
    ok &= _dialog_cycle(page, lambda: _mark_and_press(page, "button[aria-label='Add recipe']"), "AddRecipeModal", results)
    ok &= _dialog_cycle(page, lambda: _mark_and_press(page, "button[aria-label='Pick a recipe for us']"), "DecisionMaker", results)
    page.goto(base + f"/recipe/{RECIPE['id']}", wait_until="networkidle")
    page.wait_for_selector(ROUTES[1][1])
    ok &= _dialog_cycle(page, lambda: _mark_and_press(page, "button[aria-label='Edit recipe']"), "EditRecipeModal", results)
    return ok


FOCUS_JS = """() => { const sel = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const bad = []; let n = 0;
  for (const el of document.querySelectorAll(sel)) {
    if (el.offsetParent === null) continue; n++;
    el.focus({focusVisible: true});
    const cs = getComputedStyle(el);
    const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
    if (!ring) bad.push((el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30));
  }
  return { checked: n, without_ring: bad }; }"""


def check_focus_ring(page, base, results) -> bool:
    ok = True
    for path, marker in ROUTES:
        page.goto(base + path, wait_until="networkidle")
        page.wait_for_selector(marker)
        page.keyboard.press("Tab")  # put the page in keyboard modality for :focus-visible
        r = page.evaluate(FOCUS_JS)
        results["focus_ring"][path] = r
        good = not r["without_ring"]
        print(f"{'PASS' if good else 'FAIL'}  focus ring {path}: {r['checked']} checked, {len(r['without_ring'])} without: {r['without_ring'][:8]}")
        ok &= good
    return ok


RING_JS = """() => { const el = document.activeElement; if (!el || el === document.body) return false;
  const cs = getComputedStyle(el);
  return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none'); }"""


def tab_to(page, predicate_js: str, limit: int = 200):
    """Press Tab until `predicate_js(activeElement)` is true. Returns the number
    of presses, or None if the control was never reached by keyboard."""
    for n in range(1, limit + 1):
        page.keyboard.press("Tab")
        if page.evaluate(f"() => {{ const el = document.activeElement; return !!el && ({predicate_js}); }}"):
            return n
    return None


def check_keyboard_flow(browser, page, base, db, results) -> bool:
    """sign-in form reachable -> open a recipe -> put a line on the list ->
    tick it -> finish the trip. Keyboard only; every stop must show a focus ring."""
    steps = []

    def step(name, presses, extra=True):
        ring = page.evaluate(RING_JS) if presses else False
        good = bool(presses) and ring and extra
        steps.append({"step": name, "tabs": presses, "focus_visible": ring, "ok": good})
        print(f"{'PASS' if good else 'FAIL'}  keyboard: {name} (tabs={presses}, ring={ring})")
        return good

    # 1. Sign-in: a signed-OUT context, so /login renders its form.
    anon = browser.new_context()
    anon.route("**/*.supabase.co/**", ms.handler(db))
    anon.route(f"{ms.MOCK_URL}/**", ms.handler(db))
    lp = anon.new_page()
    lp.goto(base + "/login", wait_until="networkidle", timeout=120_000)
    page_backup = page
    page = lp
    ok = step("login email field", tab_to(page, "el.tagName === 'INPUT' && el.type === 'email'"))
    # The submit stays disabled until both fields hold something. Nothing is submitted.
    page.keyboard.type("someone@example.test")
    ok &= step("login password field", tab_to(page, "el.tagName === 'INPUT' && el.type === 'password'"))
    page.keyboard.type("not-a-real-password")
    ok &= step("login submit", tab_to(page, "el.tagName === 'BUTTON' && el.type === 'submit'"))
    anon.close()
    page = page_backup

    # 2. Grid -> recipe.
    page.goto(base + "/", wait_until="networkidle")
    page.wait_for_selector("text=Tomato Pasta")
    ok &= step("recipe card", tab_to(page, "el.tagName === 'A' && el.textContent.includes('Tomato Pasta')"))
    page.keyboard.press("Enter")
    page.wait_for_selector("text=Chef's Notes", timeout=60_000)

    # 3. Put spaghetti on the list (seed already holds 400 g -> expect a merge to 600 g).
    ok &= step("include 'spaghetti'", tab_to(page, "el.getAttribute('role') === 'checkbox' && el.textContent.includes('spaghetti')"))
    page.keyboard.press("Space")
    checked = page.evaluate("() => document.activeElement.getAttribute('aria-checked')") == "true"
    ok &= step("add to list button", tab_to(page, "el.tagName === 'BUTTON' && /^Add 1 item/.test(el.textContent.trim())"), checked)
    page.keyboard.press("Enter")
    page.wait_for_timeout(1500)
    spag = [r for r in db.rows("shopping_extras") if r.get("item_key") == "spaghetti"]
    merged = len(spag) == 1 and float(spag[0].get("qty_base") or 0) == 600
    print(f"{'PASS' if merged else 'FAIL'}  keyboard: list now holds 600 g spaghetti ({spag})")
    ok &= merged

    # 4. To the list, tick it, finish the trip.
    ok &= step("nav to shopping list", tab_to(page, "el.tagName === 'A' && el.getAttribute('href') === '/shopping'"))
    page.keyboard.press("Enter")
    page.wait_for_selector("text=to get", timeout=60_000)
    ok &= step("tick 'spaghetti'", tab_to(page, "el.getAttribute('aria-label') === 'Got spaghetti'"))
    page.keyboard.press("Enter")
    page.wait_for_timeout(800)
    ok &= step("checked out button", tab_to(page, "el.tagName === 'BUTTON' && el.textContent.includes('Checked out')"))
    page.keyboard.press("Enter")
    page.wait_for_timeout(2000)
    gone = not [r for r in db.rows("shopping_extras") if r.get("item_key") == "spaghetti"]
    print(f"{'PASS' if gone else 'FAIL'}  keyboard: finishing the trip removed the ticked line")
    ok &= gone
    results["keyboard"] = steps
    return ok


if __name__ == "__main__":
    sys.exit(main())
