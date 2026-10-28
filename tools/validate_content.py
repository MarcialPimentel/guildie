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
orders = load("orders.json")
kinds = {"standard", "bundle", "collector"}
for c in orders.get("customers", []):
    if not set(c.get("kinds", [])) <= kinds or not c.get("kinds"):
        err(f"orders: customer {c.get('id')!r} needs kinds from {sorted(kinds)}")
    if "{items}" not in c.get("line", ""):
        err(f"orders: customer {c.get('id')!r} line must contain {{items}}")
for kind in kinds:
    if not any(kind in c.get("kinds", []) for c in orders.get("customers", [])):
        err(f"orders: no customer posts {kind!r} orders")
    os_ = orders.get("settings", {})
    if kind not in os_.get("reward_multiplier", {}):
        err(f"orders: settings.reward_multiplier needs {kind!r}")
    # Exploit guard (0.5.1): a whole order reward must be worth less than buying the items from the
    # Guild Suppliers (ceiling x usual value), or players fill orders from supplier stock for profit.
    elif not (1 <= os_["reward_multiplier"][kind] < economy.get("market", {}).get("ceiling_multiplier", 0)):
        err(f"orders: reward_multiplier.{kind} must be at least 1 and below market.ceiling_multiplier "
            f"({economy.get('market', {}).get('ceiling_multiplier')}), or orders can be filled at a profit from the Guild Suppliers")
    if not (0 <= os_.get("rare_material_chance", {}).get(kind, -1) <= 1):
        err(f"orders: settings.rare_material_chance.{kind} must be between 0 and 1")

if not (0 <= orders.get("settings", {}).get("max_rare_share", -1) < 1):
    err("orders: settings.max_rare_share must be between 0 and 1 (the share of a reward paid as rare materials)")

calendar = load("calendar.json")
days = sorted(d.get("day") for d in calendar.get("week", []))
if days != list(range(1, 8)):
    err("calendar: week needs exactly one entry for each day 1..7")
for entry in calendar.get("week", []) + calendar.get("events", {}).get("list", []):
    for kind in ("demand", "price"):
        for item_id, x in entry.get(kind, {}).items():
            if item_id not in item_ids:
                err(f"calendar: {entry.get('name', entry.get('id'))}: unknown item {item_id!r}")
            if not (0 < x <= 5):
                err(f"calendar: {entry.get('name', entry.get('id'))}: {kind} multiplier for {item_id} out of range")

g = economy.get("guild_sale", {})
if not (0 < g.get("floor_multiplier", 0) < g.get("base_multiplier", 0) < m.get("trader_buy_below", 0)):
    err("economy: need 0 < guild_sale.floor_multiplier < guild_sale.base_multiplier < market.trader_buy_below (listing must pay better)")
if not (0 <= g.get("drop_per_unit", -1) < 1):
    err("economy: guild_sale.drop_per_unit must be between 0 and 1")
if g.get("recovery_half_life_hours", 0) <= 0:
    err("economy: guild_sale.recovery_half_life_hours must be > 0")

# The Duke's order (0.9.0, systems.md 6.5).
duke = load("duke.json")
ds = duke.get("settings", {})
ceiling = m.get("ceiling_multiplier", 0)
if not (1 <= ds.get("pay_multiplier", 0) and 0 <= ds.get("bonus_multiplier", -1)
        and ds.get("pay_multiplier", 0) + ds.get("bonus_multiplier", 0) < ceiling):
    err(f"duke: need pay_multiplier >= 1, bonus_multiplier >= 0 and pay + bonus below market.ceiling_multiplier ({ceiling}), "
        "or the Duke's order can be filled at a profit from the Guild Suppliers")
for key in ("max_share", "open_share_after"):
    if not (0 < ds.get(key, 0) <= 1):
        err(f"duke: settings.{key} must be between 0 and 1")
for key in ("duration_hours", "players_per_goal_step", "max_goal_scale", "board_size"):
    if not ds.get(key, 0) > 0:
        err(f"duke: settings.{key} must be > 0")
if not duke.get("orders"):
    err("duke: needs at least one order")
unique_ids(duke.get("orders", []), "duke orders")
item_prof = {i.get("id"): i.get("profession") for i in items}
for o in duke.get("orders", []):
    lines = o.get("lines", [])
    for field in ("title", "line"):
        if not o.get(field):
            err(f"duke: order {o.get('id')!r} needs a {field}")
    for ln in lines:
        if ln.get("item_id") not in item_ids:
            err(f"duke: order {o.get('id')!r}: unknown item {ln.get('item_id')!r}")
        if not (isinstance(ln.get("goal"), int) and ln["goal"] > 0):
            err(f"duke: order {o.get('id')!r}: goal for {ln.get('item_id')!r} must be a positive whole number")
    if len({ln.get("item_id") for ln in lines}) != len(lines):
        err(f"duke: order {o.get('id')!r} lists an item twice")
    if len({item_prof.get(ln.get("item_id")) for ln in lines}) < 2:
        err(f"duke: order {o.get('id')!r} must ask for goods from at least two guilds (it's a city-wide order)")

if errors:
    print(f"Content INVALID ({len(errors)} problems):")
    for e in errors:
        print("  - " + e)
    sys.exit(1)
print(f"Content OK: {len(items)} items, {len(professions)} professions, {len(recipes)} recipes.")
