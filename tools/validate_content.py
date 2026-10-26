#!/usr/bin/env python3
"""
Validates /content so a typo can't break the live game (systems.md 4.3).
Run: python3 tools/validate_content.py [content_dir]. Exits non-zero on any problem.
tools/package.sh runs it before every build.
"""
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "content")
errors = []


def err(msg):
    errors.append(msg)


def load(name):
    try:
        return json.loads((root / name).read_text())
    except Exception as e:
        err(f"{name}: cannot read ({e})")
        return {}


items = load("items.json").get("items", [])
professions = load("professions.json").get("professions", [])
recipes = load("recipes.json").get("recipes", [])
economy = load("economy.json")

ID = re.compile(r"^[a-z][a-z0-9_]*$")


def unique_ids(rows, label):
    seen = set()
    for r in rows:
        i = r.get("id", "")
        if not ID.match(i):
            err(f"{label}: bad id {i!r} (use lowercase_snake_case)")
        if i in seen:
            err(f"{label}: duplicate id {i!r}")
        seen.add(i)
    return seen


item_ids = unique_ids(items, "items")
prof_ids = unique_ids(professions, "professions")
recipe_ids = unique_ids(recipes, "recipes")

for it in items:
    for key in ("name", "type", "profession", "reference_value"):
        if key not in it:
            err(f"item {it.get('id')}: missing {key}")
    if it.get("type") not in ("raw", "component", "finished"):
        err(f"item {it.get('id')}: type must be raw/component/finished")
    if it.get("profession") not in prof_ids:
        err(f"item {it.get('id')}: unknown profession {it.get('profession')!r}")
    if not (isinstance(it.get("reference_value"), (int, float)) and it["reference_value"] > 0):
        err(f"item {it.get('id')}: reference_value must be > 0")

gathered = set()
for p in professions:
    st = p.get("station", {})
    if not st.get("outputs"):
        err(f"profession {p.get('id')}: station has no outputs")
    for o in st.get("outputs", []):
        if o.get("item_id") not in item_ids:
            err(f"profession {p.get('id')}: station outputs unknown item {o.get('item_id')!r}")
        if not (o.get("rate_per_hour", 0) > 0 and o.get("cap", 0) > 0):
            err(f"profession {p.get('id')}: station output {o.get('item_id')} needs rate_per_hour > 0 and cap > 0")
        gathered.add(o.get("item_id"))

made = set()
for r in recipes:
    rid = r.get("id")
    if r.get("profession") not in prof_ids:
        err(f"recipe {rid}: unknown profession {r.get('profession')!r}")
    out = r.get("output", {})
    if out.get("item_id") not in item_ids:
        err(f"recipe {rid}: unknown output {out.get('item_id')!r}")
    if out.get("quantity", 0) < 1:
        err(f"recipe {rid}: output quantity must be >= 1")
    if not r.get("inputs"):
        err(f"recipe {rid}: no inputs")
    for i in r.get("inputs", []):
        if i.get("item_id") not in item_ids:
            err(f"recipe {rid}: unknown input {i.get('item_id')!r}")
        if i.get("quantity", 0) < 1:
            err(f"recipe {rid}: input quantity must be >= 1")
    if not r.get("time_seconds", 0) > 0:
        err(f"recipe {rid}: time_seconds must be > 0")
    made.add(out.get("item_id"))

for it in items:
    if it["id"] not in gathered and it["id"] not in made:
        err(f"item {it['id']}: nothing produces it (no station output or recipe)")

for name, persona in economy.get("personas", {}).items():
    for item_id, rate in persona.get("demand_per_hour", {}).items():
        if item_id not in item_ids:
            err(f"persona {name}: demand for unknown item {item_id!r}")
        if rate < 0:
            err(f"persona {name}: negative demand for {item_id}")
    if persona.get("demand_per_hour") and not (0 < persona.get("willing_min", 0) <= persona.get("willing_max", 0)):
        err(f"persona {name}: needs 0 < willing_min <= willing_max")
for required in ("traders", "suppliers"):
    if required not in economy.get("personas", {}):
        err(f"economy: persona {required!r} is required by the market code")

if economy.get("pace", {}).get("time_multiplier", 0) <= 0:
    err("economy: pace.time_multiplier must be > 0")
m = economy.get("market", {})
if not (0 < m.get("floor_multiplier", 0) < m.get("trader_buy_below", 0) < 1 < m.get("ceiling_multiplier", 0)):
    err("economy: need 0 < floor_multiplier < trader_buy_below < 1 < ceiling_multiplier")

if errors:
    print(f"Content INVALID ({len(errors)} problems):")
    for e in errors:
        print("  - " + e)
    sys.exit(1)
print(f"Content OK: {len(items)} items, {len(professions)} professions, {len(recipes)} recipes.")
