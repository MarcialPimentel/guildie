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

# ---- progression (0.8.0, #30, #49): ranks, XP, recipe skills, starters, rare recipes, raw unlocks
pr = economy.get("progression", {})
ranks = pr.get("ranks", [])
froms = [r.get("from") for r in ranks]
if not ranks or froms[0] != 1 or froms != sorted(set(froms)):
    err("economy: progression.ranks must start at skill 1 and go up")
max_skill = pr.get("max_skill", 100)
for key in ("recipe_xp_by_rank", "trainer_price_by_rank"):
    vals = pr.get(key, [])
    if len(vals) != len(ranks) or any(not isinstance(v, (int, float)) or v <= 0 for v in vals):
        err(f"economy: progression.{key} needs one positive number per rank")
cols = pr.get("colours", [])
if not cols or [c.get("below", 0) for c in cols] != sorted(c.get("below", 0) for c in cols) \
        or any(not (0 <= c.get("factor", -1) <= 1) for c in cols) or [c["factor"] for c in cols] != sorted((c["factor"] for c in cols), reverse=True):
    err("economy: progression.colours need rising 'below' values and falling factors between 0 and 1")
if not (pr.get("trade_bonus", -1) >= 0 and pr.get("first_craft_of_day", 0) >= 1 and pr.get("xp_base", 0) > 0 and pr.get("xp_scale", 0) > 0):
    err("economy: progression needs trade_bonus >= 0, first_craft_of_day >= 1, xp_base > 0 and xp_scale > 0")
rank_ids = [r.get("id") for r in ranks]
if pr.get("bundle_orders_rank") not in rank_ids:
    err("economy: progression.bundle_orders_rank must be one of the rank ids")


def rank_of(skill):
    idx = 0
    for i, f in enumerate(froms):
        if skill >= f:
            idx = i
    return idx


item_by_id = {it["id"]: it for it in items}
unlock = {}
for prof in professions:
    for o in prof.get("station", {}).get("outputs", []):
        unlock[o.get("item_id")] = o.get("unlock_skill", 1)
        if not (isinstance(unlock[o.get("item_id")], int) and 1 <= unlock[o.get("item_id")] <= max_skill):
            err(f"profession {prof.get('id')}: unlock_skill of {o.get('item_id')} must be 1..{max_skill}")
    if not any(o.get("unlock_skill", 1) == 1 for o in prof.get("station", {}).get("outputs", [])):
        err(f"profession {prof.get('id')}: a new player must be able to gather something (one output at unlock_skill 1)")

for prof in prof_ids:
    mine = [r for r in recipes if r.get("profession") == prof]
    starters = {}
    for r in mine:
        rid, sk = r.get("id"), r.get("skill")
        if not (isinstance(sk, int) and 1 <= sk <= max_skill):
            err(f"recipe {rid}: skill must be a whole number 1..{max_skill}")
            continue
        if r.get("rare") and r.get("starter"):
            err(f"recipe {rid}: can't be both rare and a starter")
        if r.get("rare") and not r.get("name"):
            err(f"recipe {rid}: rare recipes need a name")
        if "xp_multiplier" in r and not r["xp_multiplier"] > 0:
            err(f"recipe {rid}: xp_multiplier must be > 0")
        if r.get("starter"):
            if sk != froms[rank_of(sk)]:
                err(f"recipe {rid}: a starter must sit at the first skill of its rank ({froms[rank_of(sk)]})")
            starters.setdefault(rank_of(sk), []).append(rid)
        imports = [i["item_id"] for i in r.get("inputs", []) if item_by_id.get(i["item_id"], {}).get("profession") != prof]
        # W1: Apprentice recipes import nothing.
        if imports and rank_of(sk) == 0:
            err(f"recipe {rid}: Apprentice recipes must not use other guilds' goods (rule W1)")
        for i in r.get("inputs", []):
            iid = i["item_id"]
            # No recipe uses its own guild's raw before the station unlocks it (W4).
            if iid in unlock and item_by_id.get(iid, {}).get("profession") == prof and unlock[iid] > sk:
                err(f"recipe {rid} (skill {sk}) uses {iid} before the station unlocks it (skill {unlock[iid]}) (rule W4)")
        # W4: an import must be craftable by its owner at the same skill or lower (a trainer recipe).
        for iid in imports:
            owner = item_by_id.get(iid, {}).get("profession")
            makers = [x.get("skill", 1) for x in recipes if x.get("profession") == owner and x.get("output", {}).get("item_id") == iid and not x.get("rare")]
            if iid not in unlock and (not makers or min(makers) > sk):
                err(f"recipe {rid} (skill {sk}) imports {iid} before {owner} can make it (rule W4)")
    if not starters.get(0):
        err(f"profession {prof}: needs a free Apprentice starter recipe at skill 1")
    for rank, ids in starters.items():
        if len(ids) > 1:
            err(f"profession {prof}: one starter per rank, found {ids}")

os_ = orders.get("settings", {})
for kind in kinds:
    if not os_.get("xp_multiplier", {}).get(kind, -1) >= 0:
        err(f"orders: settings.xp_multiplier.{kind} must be >= 0")
    if not (0 <= os_.get("rare_recipe_chance", {}).get(kind, -1) <= 1):
        err(f"orders: settings.rare_recipe_chance.{kind} must be between 0 and 1")

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

# Orders grow with rank (0.12.0): one rising [min, max] value range per rank.
tv = orders.get("settings", {}).get("target_value_by_rank")
if tv is not None and (len(tv) != len(ranks) or any(not (0 < a <= b) for a, b in tv) or [a for a, _ in tv] != sorted(a for a, _ in tv)):
    err("orders: settings.target_value_by_rank needs one rising [min, max] pair per rank")

# The new-player guide (0.14.0): steps the server can check, pointing at places that exist.
guide = load("guide.json")
GUIDE_CHECKS = {"activity:gathered", "activity:crafted", "learned", "mark:palazzo", "mark:slap"}
GUIDE_TARGETS = {None, "station", "workbench", "orders", "ledger", "bag", "steps"}
if not guide.get("steps"):
    err("guide: needs at least one step")
unique_ids(guide.get("steps", []), "guide steps")
if not (isinstance(guide.get("final_reward"), int) and guide["final_reward"] >= 0):
    err("guide: final_reward must be a whole number >= 0")
for st in guide.get("steps", []):
    where = f"guide step {st.get('id')!r}"
    if not st.get("title") or not st.get("hint"):
        err(f"{where}: needs a title and a hint")
    if not (isinstance(st.get("reward"), int) and st["reward"] >= 0):
        err(f"{where}: reward must be a whole number >= 0")
    if st.get("check") not in GUIDE_CHECKS:
        err(f"{where}: check must be one of {sorted(GUIDE_CHECKS)} (the server knows how to check those)")
    if st.get("target") not in GUIDE_TARGETS:
        err(f"{where}: target must be a quay place or null")
if len(guide.get("steps", [])) > 250:
    err("guide: at most 250 steps (players from before 0.14.0 are stored at step 255)")

# ---------------------------------------------------------------- guilds are content (0.10.3)
# Each guild's names, colors and hats live in professions.json; its art is two files named after its kit.
# A guild without them would draw as plain art in the game, so CI stops it here instead.
repo = root.parent
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
seen_labels = {}
for p in professions:
    pid, gd = p.get("id"), p.get("guild") or {}
    for key in ("kit", "hall", "piazza", "quarter", "goods", "workbench", "color", "trim", "hats"):
        if not gd.get(key):
            err(f"profession {pid}: guild.{key} is missing (see the _comment in professions.json)")
    for key in ("color", "trim"):
        if gd.get(key) and not HEX.match(gd[key]):
            err(f"profession {pid}: guild.{key} must be a color like #B83A3A")
    hats = gd.get("hats") or []
    if not (isinstance(hats, list) and all(isinstance(h, str) and h for h in hats)):
        err(f"profession {pid}: guild.hats must be a list of hat names")
    for key in ("hall", "piazza", "quarter"):
        if gd.get(key) in seen_labels.get(key, set()):
            err(f"profession {pid}: guild.{key} {gd[key]!r} is already another guild's")
        seen_labels.setdefault(key, set()).add(gd.get(key))
    if not p.get("station", {}).get("find_label"):
        err(f"profession {pid}: station.find_label (the rich-find text) is missing")
    kit = gd.get("kit", "")
    if kit and not ID.match(kit):
        err(f"profession {pid}: guild.kit {kit!r} must be lowercase_snake_case")
    elif kit and (repo / "client").exists():
        k3d, k2d = repo / f"client/src/world/kits/{kit}.ts", repo / f"client/src/ui/portraits/{kit}.tsx"
        for path in (k3d, k2d):
            if not path.exists():
                err(f"profession {pid}: kit {kit!r} has no art file {path.relative_to(repo).as_posix()}")
        # One hat in each kit per hat name. Kits list one hat per line inside "hats: [ ... ]":
        # "{ parts: ..." in the 3D kit, "<g>..." in the portrait kit.
        for path, start in ((k3d, "{ parts:"), (k2d, "<")):
            if path.exists() and isinstance(hats, list):
                body = re.search(r"\n  hats: \[\n(.*?)\n  \],", path.read_text(encoding="utf-8").replace("\r\n", "\n"), re.S)
                n = len([ln for ln in body.group(1).split("\n") if ln.strip().startswith(start)]) if body else -1
                if n != len(hats):
                    err(f"profession {pid}: {path.relative_to(repo).as_posix()} has {n} hats but guild.hats names {len(hats)} "
                        "(one hat per line inside 'hats: [ ... ]')")

# Every item needs an icon (client/src/icons/<id>.svg), or it shows as a blank tile.
icons = repo / "client/src/icons"
if icons.exists():
    for it in items:
        if not (icons / f"{it['id']}.svg").exists():
            err(f"item {it['id']}: no icon (client/src/icons/{it['id']}.svg)")

# ---------------------------------------------------------------- the web rules W2, W3, W5, W6, W7 (professions.md §7)
# W1 and W4 are checked above for every recipe. W2, W3 and W6 describe a whole rank or ladder, so they're
# enforced once a guild's rank has its full ladder of trainer recipes (LADDER_PER_RANK); before that they
# print as warnings. W5's value share is a [tune] target and stays a warning.
LADDER_PER_RANK = 4
warnings = []


def warn(msg):
    warnings.append(msg)


def rule(complete, msg):
    (err if complete else warn)(msg)


def imports_of(r):
    return [i for i in r.get("inputs", []) if item_by_id.get(i["item_id"], {}).get("profession") != r.get("profession")]


trainer = [r for r in recipes if not r.get("rare") and isinstance(r.get("skill"), int)]
complete_guild = {}
for prof in sorted(prof_ids):
    full = True
    for ri in range(len(ranks)):
        rs = [r for r in trainer if r.get("profession") == prof and rank_of(r["skill"]) == ri]
        complete = len(rs) >= LADDER_PER_RANK
        full = full and complete
        name = ranks[ri].get("name", ri)
        if not rs:
            continue
        # W3: every rank has a recipe with no imports, so anyone can skill up alone.
        if not any(not imports_of(r) for r in rs):
            rule(complete, f"{prof} {name}: every recipe imports; add one that doesn't (rule W3)")
        # W2: imports grow with rank: some Journeyman and most Expert recipes import; Master needs 2+ other guilds.
        importing = sum(1 for r in rs if imports_of(r))
        if ri == 1 and importing < 1:
            rule(complete, f"{prof} {name}: no recipe imports yet (rule W2: about half should)")
        if ri == 2 and importing < len(rs) / 2:
            rule(complete, f"{prof} {name}: only {importing} of {len(rs)} recipes import (rule W2: about three quarters)")
        if ri >= 3 and not any(len({item_by_id[i["item_id"]]["profession"] for i in imports_of(r)}) >= 2 for r in rs):
            rule(complete, f"{prof} {name}: no prestige recipe needs two other guilds (rule W2)")
    complete_guild[prof] = full

for r in trainer:
    imp = imports_of(r)
    if not imp:
        continue
    own = sum(i.get("quantity", 0) for i in r.get("inputs", []) if i not in imp)
    # W5: imports are a small share: never more imported units than your own...
    if sum(i.get("quantity", 0) for i in imp) > own:
        err(f"recipe {r['id']}: more imported units than its own (rule W5)")
    # ...and about 35% of the input value [tune].
    total = sum(i.get("quantity", 0) * item_by_id[i["item_id"]]["reference_value"] for i in r.get("inputs", []))
    share = sum(i.get("quantity", 0) * item_by_id[i["item_id"]]["reference_value"] for i in imp) / total if total else 0
    if share > 0.35:
        warn(f"recipe {r['id']}: imports are {share:.0%} of its input value (rule W5 aims for about 35%)")

# W6: every guild's exports are used by every other guild, and no guild supplies more than half the import slots.
all_full = bool(complete_guild) and all(complete_guild.values())
slots = {}
for r in trainer:
    for i in imports_of(r):
        slots.setdefault(item_by_id[i["item_id"]]["profession"], []).append(r.get("profession"))
for prof in sorted(prof_ids):
    users = set(slots.get(prof, []))
    for other in sorted(prof_ids - {prof}):
        if other not in users:
            rule(all_full, f"{prof} goods aren't used by any {other} recipe (rule W6)")
total_slots = sum(len(v) for v in slots.values())
for prof, v in sorted(slots.items()):
    if total_slots and len(v) > total_slots / 2:
        rule(all_full, f"{prof} supplies {len(v)} of {total_slots} import slots, more than half (rule W6)")

# W7: every component and finished good has an NPC buyer, or it can only be dumped on traders and the guild.
demanded = set()
for persona in economy.get("personas", {}).values():
    demanded |= {k for k, v in persona.get("demand_per_hour", {}).items() if v > 0}
for it in items:
    if it.get("type") != "raw" and it["id"] not in demanded:
        err(f"item {it['id']}: no NPC persona buys it (add it to a persona's demand_per_hour in economy.json, rule W7)")

# Bottega upgrades (0.11.0, docs/palazzo.md §2): level L opens rank L-1, so its goods must come from both other
# guilds and only from recipes crafters one rank lower can make (otherwise nobody can reach the first Journeyman).
ranks = economy.get("progression", {}).get("ranks", [])
levels = {int(l["level"]) for l in economy.get("workshop", {}).get("levels", [])}
if levels and levels != set(range(1, len(ranks) + 1)):
    err(f"economy.workshop.levels must be levels 1..{len(ranks)} (one per rank)")
item_by_id = {it["id"]: it for it in items}
made_at = {}
for rc in recipes:
    if not rc.get("rare"):
        oid = rc["output"]["item_id"]
        made_at[oid] = min(made_at.get(oid, 999), int(rc.get("skill", 1)))
for p in professions:
    path = p.get("workshop", [])
    if sorted(int(u["level"]) for u in path) != list(range(2, len(ranks) + 1)):
        err(f"profession {p['id']}: workshop must have one upgrade for each level 2..{len(ranks)}")
    for u in path:
        lv = int(u["level"])
        where = f"profession {p['id']} workshop level {lv}"
        if int(u.get("gold", 0)) <= 0 or float(u.get("hours", 0)) <= 0 or not u.get("name"):
            err(f"{where}: needs a name, gold and hours")
        guilds = set()
        for it in u.get("items", []):
            if it["item_id"] not in item_by_id:
                err(f"{where}: unknown item {it['item_id']}")
                continue
            guilds.add(item_by_id[it["item_id"]]["profession"])
            top = int(ranks[lv - 1]["from"]) - 1 if lv - 1 < len(ranks) else 100   # the top of the rank below the one this opens
            need = made_at.get(it["item_id"], 1)
            if need > top:
                err(f"{where}: {it['item_id']} is made from skill {need}, above {top}; crafters who need this upgrade can't make it yet")
        if len(guilds - {p["id"]}) < 2:
            err(f"{where}: must ask for goods from both other guilds (Pillar 5)")

# The Palazzo's officials (0.11.0): ids the client knows, a rumor and favor kind each.
palazzo = load("palazzo.json")
ids = [n.get("id") for n in palazzo.get("npcs", [])]
if ids != ["notary", "crier", "steward"]:
    err("palazzo.json: the officials must be notary, crier, steward (the 3D Palazzo has a spot and a look for each)")
for n in palazzo.get("npcs", []):
    if n.get("rumor") not in ("market", "week", "events") or n.get("favor") not in ("raws", "goods", "imports") or not n.get("lines") or "{items}" not in n.get("favor_line", ""):
        err(f"palazzo.json {n.get('id')}: needs rumor (market|week|events), favor (raws|goods|imports), lines, and a favor_line with {{items}}")
pz = economy.get("palazzo", {})
if float(pz.get("favor_reward_multiplier", 0)) >= float(economy.get("market", {}).get("ceiling_multiplier", 1.5)):
    err("economy.palazzo.favor_reward_multiplier must stay under market.ceiling_multiplier (the Guild Suppliers' price)")
if any(p["id"] == "palazzo" for p in professions):
    err("no guild may be called 'palazzo': that's the shared square's room")

if errors:
    print(f"Content INVALID ({len(errors)} problems):")
    for e in errors:
        print("  - " + e)
    sys.exit(1)
print(f"Content OK: {len(items)} items, {len(professions)} professions, {len(recipes)} recipes.")
if warnings:
    print(f"Web rules not enforced yet (a rank's ladder isn't complete, or a [tune] target): {len(warnings)}")
    for w in warnings:
        print("  - " + w)
