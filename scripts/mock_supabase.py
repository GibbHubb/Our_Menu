"""OM58/OM60 — a fake Supabase for browser checks that must never touch production.

Run the app locally with

    NEXT_PUBLIC_SUPABASE_URL=https://mock.supabase.test
    NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key
    npm run dev -- -p 3123

(process env wins over .env / .env.local in Next), then call
`install(page_or_context, db)` before the first navigation. Every request to
the mock host is answered here from an in-memory table store; nothing leaves
the machine. A request to ANY other supabase.co host is aborted and recorded in
`db.leaks`, so a harness can assert it never reached production.

The PostgREST subset implemented is exactly what the app uses: select with
eq/neq/in/is filters, single-object Accept, insert/upsert/update/delete with
`Prefer: return=representation`, and RPCs (stubbed per name).
"""
from __future__ import annotations

import base64
import json
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlparse

MOCK_HOST = "mock.supabase.test"
MOCK_URL = f"https://{MOCK_HOST}"
# supabase-js keys its session storage by the first label of the host.
STORAGE_KEY = "sb-mock-auth-token"

USER_ID = "00000000-0000-4000-8000-000000000001"
HOUSEHOLD_ID = "00000000-0000-4000-8000-0000000000aa"
EMAIL = "a11y@example.test"


def _b64(obj: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")


def fake_session() -> dict:
    exp = int(time.time()) + 3600 * 24
    token = ".".join([
        _b64({"alg": "HS256", "typ": "JWT"}),
        _b64({"sub": USER_ID, "role": "authenticated", "exp": exp, "email": EMAIL, "aud": "authenticated"}),
        "mock-signature",
    ])
    return {
        "access_token": token, "refresh_token": "mock-refresh", "token_type": "bearer",
        "expires_in": 3600 * 24, "expires_at": exp, "user": fake_user(),
    }


def fake_user() -> dict:
    return {
        "id": USER_ID, "aud": "authenticated", "role": "authenticated", "email": EMAIL,
        "app_metadata": {"provider": "email"}, "user_metadata": {},
        "created_at": "2026-01-01T00:00:00Z",
    }


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class DB:
    def __init__(self, tables: dict[str, list[dict]] | None = None):
        self.tables: dict[str, list[dict]] = {k: [dict(r) for r in v] for k, v in (tables or {}).items()}
        self.leaks: list[str] = []
        self.log: list[str] = []
        self.offline = False          # OM60: answer nothing while "offline"
        self.fail_writes: set[str] = set()  # OM60 negative control: tables whose writes 404

    def rows(self, table: str) -> list[dict]:
        return self.tables.setdefault(table, [])


def _coerce(v: str):
    if v == "null":
        return None
    if v in ("true", "false"):
        return v == "true"
    return v


def _match(row: dict, filters: list[tuple[str, str]]) -> bool:
    for col, expr in filters:
        op, _, val = expr.partition(".")
        cell = row.get(col)
        if op == "eq":
            if str(cell).lower() if isinstance(cell, bool) else cell != _coerce(val):
                if not (isinstance(cell, bool) and str(cell).lower() == val):
                    if str(cell) != val:
                        return False
        elif op == "neq":
            if str(cell) == val:
                return False
        elif op == "is":
            if _coerce(val) is None and cell is not None:
                return False
        elif op == "in":
            items = [x.strip().strip('"') for x in val.strip("()").split(",") if x.strip()]
            if str(cell) not in items:
                return False
    return True


def _split(query: str):
    filters, params = [], {}
    for k, v in parse_qsl(query, keep_blank_values=True):
        if k in ("select", "order", "limit", "offset", "on_conflict", "columns"):
            params[k] = v
        else:
            filters.append((k, v))
    return filters, params


def _rpc(db: DB, name: str, body: dict):
    if name == "server_now":
        return now_iso()
    if name == "ensure_household":
        return HOUSEHOLD_ID
    if name == "list_household_members":
        return [{"user_id": USER_ID, "email": EMAIL, "household_id": HOUSEHOLD_ID, "role": "owner"}]
    if name == "claim_orphan_data":
        return []
    return []


def handler(db: DB):
    def handle(route, request):
        url = urlparse(request.url)
        if url.hostname != MOCK_HOST:
            db.leaks.append(request.url)
            return route.abort()
        if db.offline:
            return route.abort("internetdisconnected")
        method = request.method
        path = url.path
        db.log.append(f"{method} {path}?{url.query}")
        headers = {"content-type": "application/json", "access-control-allow-origin": "*",
                   "access-control-allow-headers": "*", "access-control-allow-methods": "*",
                   "access-control-expose-headers": "*"}
        if method == "OPTIONS":
            return route.fulfill(status=204, headers=headers)

        def reply(data, status=200, extra=None):
            h = dict(headers, **(extra or {}))
            return route.fulfill(status=status, headers=h, body="" if data is None else json.dumps(data))

        if path.startswith("/auth/v1/"):
            what = path[len("/auth/v1/"):]
            if what == "user":
                return reply(fake_user())
            if what == "logout":
                return reply(None, 204)
            if what.startswith("token"):
                return reply(fake_session())
            return reply({})

        if path.startswith("/rest/v1/rpc/"):
            name = path.rsplit("/", 1)[-1]
            try:
                body = json.loads(request.post_data or "{}")
            except ValueError:
                body = {}
            return reply(_rpc(db, name, body))

        if not path.startswith("/rest/v1/"):
            return reply({})

        table = path[len("/rest/v1/"):]
        rows = db.rows(table)
        filters, params = _split(url.query)
        accept = request.headers.get("accept", "")
        prefer = request.headers.get("prefer", "")
        single = "vnd.pgrst.object" in accept

        def out(data, status=200):
            if single:
                if not data:
                    return reply({"code": "PGRST116", "message": "0 rows"}, 406)
                return reply(data[0], status)
            return reply(data, status, {"content-range": f"0-{max(len(data) - 1, 0)}/{len(data)}"})

        if method in ("GET", "HEAD"):
            data = [r for r in rows if _match(r, filters)]
            if "limit" in params:
                data = data[: int(params["limit"])]
            return out(data)

        if table in db.fail_writes:
            return reply({"code": "PGRST205", "message": f"Could not find the table 'public.{table}'"}, 404)
        body = json.loads(request.post_data or "null")
        if method == "POST":
            items = body if isinstance(body, list) else [body]
            done = []
            upsert = "resolution=merge-duplicates" in prefer
            conflict = [c for c in params.get("on_conflict", "").split(",") if c]
            for it in items:
                it = dict(it)
                if upsert and conflict:
                    key_cols = [c for c in conflict if c != "household_id"]
                    hit = next((r for r in rows if all(r.get(c) == it.get(c) for c in key_cols)), None)
                    if hit:
                        hit.update(it)
                        hit["updated_at"] = now_iso()
                        done.append(hit)
                        continue
                it.setdefault("id", str(uuid.uuid4()))
                it.setdefault("created_at", now_iso())
                it.setdefault("updated_at", now_iso())
                it.setdefault("household_id", HOUSEHOLD_ID)
                rows.append(it)
                done.append(it)
            return out(done if "return=representation" in prefer else [], 201)
        if method == "PATCH":
            hit = [r for r in rows if _match(r, filters)]
            for r in hit:
                r.update(body or {})
            return out(hit if "return=representation" in prefer else [])
        if method == "DELETE":
            hit = [r for r in rows if _match(r, filters)]
            db.tables[table] = [r for r in rows if r not in hit]
            return out(hit if "return=representation" in prefer else [])
        return reply({}, 405)

    return handle


def install(target, db: DB) -> None:
    """Route every Supabase host through the mock; seed a signed-in session."""
    target.route("**/*.supabase.co/**", handler(db))
    target.route(f"{MOCK_URL}/**", handler(db))
    target.add_init_script(
        f"try {{ if (!localStorage.getItem({json.dumps(STORAGE_KEY)})) "
        f"localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(json.dumps(fake_session()))}); }} catch (e) {{}}"
    )


def seed() -> dict[str, list[dict]]:
    """Three small recipes and an empty list: enough to render every route."""
    base = {"created_at": "2026-01-01T00:00:00Z", "household_id": HOUSEHOLD_ID, "user_id": USER_ID,
            "image_url": "", "link": "", "notes": "", "rating": 4, "seasons": [], "diet": [],
            "diet_auto": True, "servings": 4, "is_public": False}
    recipes = [
        dict(base, id="11111111-1111-4111-8111-111111111111", title="Tomato Pasta", category=["Pasta", "Midweek"],
             ingredients="200 g spaghetti\n1 can tomatoes\n2 cloves garlic\n1 tbsp olive oil",
             instructions="Boil pasta.\nMake sauce.", shopping_list="200 g spaghetti\n1 can tomatoes\n2 cloves garlic\n1 tbsp olive oil"),
        dict(base, id="22222222-2222-4222-8222-222222222222", title="Chicken Soup", category=["Soup"],
             ingredients="500 g chicken\n1 onion\n2 carrots\n1 l chicken stock",
             instructions="Simmer.", shopping_list="500 g chicken\n1 onion\n2 carrots\n1 l chicken stock"),
        dict(base, id="33333333-3333-4333-8333-333333333333", title="Lime Salad", category=["Salad"],
             ingredients="1 lettuce\n2 tbsp lime juice\n1/2 tsp salt",
             instructions="Toss.", shopping_list="1 lettuce\n2 tbsp lime juice\n1/2 tsp salt"),
    ]
    return {
        "recipes": recipes,
        "shopping_extras": [
            {"id": "e0000000-0000-4000-8000-000000000001", "label": "tomatoes", "item_key": "tomato",
             "qty_base": 2, "family": "count", "unit_hint": "can", "created_at": "2026-01-01T00:00:01Z"},
            {"id": "e0000000-0000-4000-8000-000000000002", "label": "spaghetti", "item_key": "spaghetti",
             "qty_base": 400, "family": "mass", "unit_hint": "g", "created_at": "2026-01-01T00:00:02Z"},
            {"id": "e0000000-0000-4000-8000-000000000003", "label": "salt", "item_key": "salt",
             "qty_base": None, "family": None, "unit_hint": None, "created_at": "2026-01-01T00:00:03Z"},
        ],
        "shopping_ticks": [],
        "pantry_items": [],
        "collections": [],
        "recipe_collection_items": [],
        "households": [{"id": HOUSEHOLD_ID, "name": "Test kitchen"}],
        "household_members": [{"household_id": HOUSEHOLD_ID, "user_id": USER_ID}],
        "cook_log": [],
    }
