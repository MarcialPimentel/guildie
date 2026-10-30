#!/usr/bin/env python3
"""
Guildie API smoke test. Exercises accounts, professions, gathering, crafting, the Exchange, the 0-gold path,
Sell to guild, feedback, the City, trades, orders, the ticker, skill and XP, the guild trainer (0.8.0) and
(optionally) the NPC market tick, end to end.

    python3 tools/smoke_test.py URL [--tick "COMMAND"] [--feedback-key KEY] [--player-tool "COMMAND"]

    URL             e.g. http://127.0.0.1:8080/games/guildie/api/index.php
    --tick          a shell command that forces one market tick (local testing only), e.g.
                    "php server/app/tick.php --force". Without it, market checks are skipped.
    --feedback-key  the server's config.php feedback_key, to check the private feedback page.
    --player-tool   the test helper (local testing only), e.g. "php tools/test_player.php". Used to set a
                    player's skill (rank-up check) and to turn a player into a pre-0.8.0 one (skill replay).

Crafting checks wait for real craft timers, so for speed run the server with a content copy whose
economy.json has a small pace.time_multiplier (e.g. 0.05). Creates throwaway smoke_* players.
"""
import json
import random
import string
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

args = sys.argv[1:]
BASE = args[0] if args and not args[0].startswith("--") else "http://127.0.0.1:8080/games/guildie/api/index.php"
TICK = args[args.index("--tick") + 1] if "--tick" in args else None
# The content this server runs (checks compare against it, so adding recipes or guilds doesn't break them).
CONTENT = __import__("pathlib").Path(__file__).resolve().parent.parent / "content"
GUILDS = json.loads((CONTENT / "professions.json").read_text(encoding="utf-8"))["professions"]
RECIPES = json.loads((CONTENT / "recipes.json").read_text(encoding="utf-8"))["recipes"]
SUPPLIERS = "the guild suppliers"   # economy.json personas.suppliers.label (how NPC sellers are named)
FEEDBACK_KEY = args[args.index("--feedback-key") + 1] if "--feedback-key" in args else None
PLAYER_TOOL = args[args.index("--player-tool") + 1] if "--player-tool" in args else None
failures = 0


def call(action, body=None, token=None, method=None, query=""):  # query: extra "&k=v" parameters
    method = method or ("POST" if body is not None else "GET")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}?action={action}{query}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-Guildie-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def get_raw(query):
    """GET a non-JSON page; returns (status, text)."""
    try:
        with urllib.request.urlopen(f"{BASE}?{query}", timeout=30) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def check(label, condition, detail=""):
    global failures
    print(("PASS  " if condition else "FAIL  ") + label + ("" if condition else f"  -> {str(detail)[:400]}"))
    if not condition:
        failures += 1
    return condition


def rand(n=8):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def have(state, item_id):
    return sum(i["quantity"] for i in state.get("inventory", []) if i["item_id"] == item_id)


def register(prefix):
    name, pw = f"smoke_{prefix}{rand(5)}", "pw-" + rand(10)
    s, r = call("register", {"name": name, "password": pw})
    return name, pw, (r["data"]["token"] if r.get("ok") else None), r


def wait_for_crafts(token, timeout=90):
    end = time.time() + timeout
    while time.time() < end:
        s, r = call("get_state", token=token)
        crafts = r["data"]["crafts"]
        if crafts and all(c["done"] for c in crafts):
            return True
        time.sleep(max(0.5, min(5, min((c["seconds_left"] for c in crafts), default=1))))
    return False


# ---------------------------------------------------------------- accounts
s, r = call("ping")
check("ping ok", s == 200 and r["ok"], r)
s, r = call("get_state")
check("get_state needs login", s == 401, r)

name, pw, tok_a, r = register("a")
check("register player A", tok_a is not None, r)
state = r["data"]["state"] if r.get("ok") else {}
check("new player has gold and no profession", state.get("player", {}).get("gold", 0) > 0 and state.get("profession") is None, state)

s, r = call("register", {"name": name.upper(), "password": pw})
check("duplicate name rejected", s == 409, r)
s, r = call("login", {"name": name, "password": "wrong"})
check("wrong password rejected", s == 401, r)
s, r = call("login", {"name": name, "password": pw})
check("login works", s == 200 and r["data"]["token"], r)

s, r = call("test_add_item", {"item_id": "copper_ore"}, token=tok_a)
check("M0 test_add_item removed", s == 404, r)

# ---------------------------------------------------------------- professions
s, r = call("professions", token=tok_a)
check("profession list matches content", s == 200 and [p["id"] for p in r["data"]["professions"]] == [g["id"] for g in GUILDS], r)
s, r = call("collect_station", {}, token=tok_a)
check("collect before choosing -> no_profession", s == 400 and r["error"]["code"] == "no_profession", r)
s, r = call("choose_profession", {"profession_id": "wizard"}, token=tok_a)
check("unknown profession rejected", s == 400, r)
s, r = call("choose_profession", {"profession_id": "alchemist"}, token=tok_a)
check("choose alchemist", s == 200 and r["data"]["profession"]["id"] == "alchemist", r)
state = r["data"]
station = {o["item_id"]: o for o in state["profession"]["station"]["outputs"]}
check("station starts partly full", station["sunleaf"]["ready"] > 0, station)
check("raw 2 is locked for a new player until skill 15 (#30)", "ember_moss" not in station
      and state["profession"]["station"]["locked"][0] == {"item_id": "ember_moss", "name": "Ember Moss", "unlock_skill": 15}
      and all(x["unlock_skill"] > 1 for x in state["profession"]["station"]["locked"]), state["profession"]["station"])
check("a new alchemist knows only the free starter recipe (#49)", [r["id"] for r in state["profession"]["recipes"]] == ["healing_draught"], state["profession"]["recipes"])
prog = state["profession"].get("progress", {})
check("starts at skill 1/100, Apprentice, Journeyman at 26, double XP waiting", prog.get("skill") == 1 and prog.get("max_skill") == 100
      and prog.get("rank") == "Apprentice" and prog.get("next_rank") == {"name": "Journeyman", "at": 26} and prog.get("first_craft_bonus") is True
      and prog.get("xp") == 0 and prog.get("xp_needed") == 22, prog)
r0 = state["profession"]["recipes"][0]
check("recipes show colour and XP per craft", r0.get("colour") == "orange" and r0.get("xp_each") == 10 and r0.get("discovered") is False, r0)
s, r = call("choose_profession", {"profession_id": "blacksmith"}, token=tok_a)
check("can't choose twice", s == 409, r)

# ---------------------------------------------------------------- gathering
s, r = call("collect_station", {}, token=tok_a)
check("collect station", s == 200 and len(r["data"]["collected"]) > 0, r)
check("collect reports surprises (#48), maybe none", s == 200 and isinstance(r["data"].get("surprises"), list), r)
state = r["data"]["state"]
sunleaf = have(state, "sunleaf")
check("sunleaf in inventory", sunleaf > 0, state["inventory"])
s, r = call("collect_station", {}, token=tok_a)
check("collect again right away -> nothing (or a little)", s in (200, 400), r)

# ---------------------------------------------------------------- crafting
s, r = call("start_craft", {"recipe_id": "iron_sword", "quantity": 1}, token=tok_a)
check("other profession's recipe rejected", s == 400 and r["error"]["code"] == "wrong_profession", r)
s, r = call("start_craft", {"recipe_id": "healing_draught", "quantity": 999}, token=tok_a)
check("batch over limit rejected", s == 400, r)
s, r = call("start_craft", {"recipe_id": "steam_tonic", "quantity": 1}, token=tok_a)
check("unknown recipe refused (#49)", s == 400 and r["error"]["code"] == "recipe_not_known", r)
s, r = call("start_craft", {"recipe_id": "healing_draught", "quantity": 10}, token=tok_a)
check("missing inputs rejected", s == 400 and r["error"]["code"] == "not_enough_items", r)

batch = min(3, sunleaf // 2)
s, r = call("start_craft", {"recipe_id": "healing_draught", "quantity": batch - 1}, token=tok_a)
check(f"start batch of {batch - 1} healing draughts", s == 200 and len(r["data"]["crafts"]) == 1, r)
check("inputs removed at start", have(r["data"], "sunleaf") == sunleaf - 2 * (batch - 1), r["data"]["inventory"])
s, r = call("collect_crafts", {}, token=tok_a)
check("collect before done -> nothing_to_collect", s == 400 and r["error"]["code"] == "nothing_to_collect", r)

s, r = call("start_craft", {"recipe_id": "healing_draught", "quantity": 1}, token=tok_a)
check("second slot used", s == 200 and len(r["data"]["crafts"]) == 2, r)
s, r = call("start_craft", {"recipe_id": "healing_draught", "quantity": 1}, token=tok_a)
check("third craft blocked: no free slot", s == 400 and r["error"]["code"] == "no_free_slot", r)

check("crafts finish", wait_for_crafts(tok_a), "timed out")
s, r = call("collect_crafts", {}, token=tok_a)
check("collect finished crafts", s == 200 and len(r["data"]["collected"]) == 2, r)
state = r["data"]["state"]
check("draughts in inventory", have(state, "healing_draught") == batch, state["inventory"])
check("slots free again", len(state["crafts"]) == 0, state["crafts"])
check("activity recorded", any(a["type"] == "crafted" for a in state["activity"]), state["activity"])
# XP (#30): 2 crafts x 10 XP, doubled (first of the day) = 40, then 1 x 10 = 10. First Healing Draught: +1 skill.
# Skill 1 -> 2 (discovery), 40 XP -> 3 with 16 left, then 26 XP -> 4 with 0 left.
pr = r["data"].get("progress") or {}
check("collect pays XP: first batch of the day doubled, +1 skill on discovery", pr.get("xp") == (batch - 1) * 20 + 10
      and pr.get("doubled") is True and pr.get("discoveries") == ["Healing Draught"] and pr.get("skill_from") == 1, pr)
check("skill and XP stored on the server", state["profession"]["progress"]["skill"] == pr.get("skill_to")
      and state["profession"]["progress"]["first_craft_bonus"] is False, state["profession"]["progress"])
if batch == 3:
    check("skill 1 -> 4 with 0 XP over (XP curve 20 x (1 + L/20)^2)", pr.get("skill_to") == 4 and state["profession"]["progress"]["xp"] == 0, (pr, state["profession"]["progress"]))
check("skill-up in activity", any(a["type"] == "skill_up" and "Alchemist skill 1 → " in a["text"] for a in state["activity"]), state["activity"][:4])

# ---------------------------------------------------------------- exchange
name_b, pw_b, tok_b, r = register("b")
call("choose_profession", {"profession_id": "blacksmith"}, token=tok_b)
s, r = call("get_state", token=tok_b)
gold_b = r["data"]["player"]["gold"]

s, r = call("sell_quote", {"item_id": "healing_draught", "quantity": batch}, token=tok_a)
check("sell quote", s == 200 and r["data"]["you_have"] == batch and "24" in r["data"]["deposits"], r)
deposit = r["data"]["deposits"]["24"] if r.get("ok") else 0

s, r = call("get_state", token=tok_a)
gold_a = r["data"]["player"]["gold"]
s, r = call("list_item", {"item_id": "healing_draught", "quantity": 99, "unit_price": 14, "duration_hours": 24}, token=tok_a)
check("can't list more than you have", s == 400 and r["error"]["code"] == "not_enough_items", r)
s, r = call("list_item", {"item_id": "healing_draught", "quantity": batch, "unit_price": 14, "duration_hours": 7}, token=tok_a)
check("bad duration rejected", s == 400, r)
s, r = call("list_item", {"item_id": "healing_draught", "quantity": batch, "unit_price": 99999, "duration_hours": 24}, token=tok_a)
check("absurd price rejected", s == 400 and r["error"]["code"] == "bad_price", r)
s, r = call("list_item", {"item_id": "healing_draught", "quantity": batch, "unit_price": 14, "duration_hours": 24}, token=tok_a)
check("list draughts at 14", s == 200, r)
listing_id = r["data"]["listing"]["listing_id"] if r.get("ok") else 0
state = r["data"]["state"] if r.get("ok") else {}
check("items left inventory", have(state, "healing_draught") == 0, state.get("inventory"))
check("no deposit charged up front (#27)", state.get("player", {}).get("gold") == gold_a, (gold_a, deposit, state.get("player")))

s, r = call("market", token=tok_b)
row = next((i for i in r["data"]["items"] if i["item_id"] == "healing_draught"), {})
check("market overview shows the listing", s == 200 and row.get("from_players", 0) >= batch, row)

s, r = call("market_item", {"item_id": "healing_draught"}, token=tok_b)
mine = [l for l in r["data"]["listings"] if l["id"] == listing_id]
check("item detail shows listing with seller name", mine and mine[0]["seller"] == name, r["data"]["listings"][:3])

s, r = call("buy_listing", {"listing_id": listing_id, "quantity": 1}, token=tok_a)
check("can't buy own listing", s == 400 and r["error"]["code"] == "own_listing", r)
s, r = call("buy_listing", {"listing_id": listing_id, "quantity": batch + 5}, token=tok_b)
check("can't buy more than listed", s == 409, r)
s, r = call("buy_listing", {"listing_id": listing_id, "quantity": 1}, token=tok_b)
check("B buys 1 draught (partial)", s == 200 and r["data"]["purchase"]["total"] == 14, r)
check("B paid 14", r["data"]["state"]["player"]["gold"] == gold_b - 14, r["data"]["state"]["player"])
check("B has the draught", have(r["data"]["state"], "healing_draught") == 1, r["data"]["state"]["inventory"])

deposit_share = min(-(-deposit // batch), 13)   # deposit taken in proportion to what sold, from the sale
s, r = call("get_state", token=tok_a)
check(f"A got 14 minus 5% cut minus {deposit_share}g deposit share", r["data"]["player"]["gold"] == gold_a + 13 - deposit_share, (deposit, r["data"]["player"]))
check("A sees 'sold' activity naming B", any(a["type"] == "sold" and name_b in a["text"] for a in r["data"]["activity"]), r["data"]["activity"][:3])

s, r = call("my_listings", token=tok_a)
mine = [l for l in r["data"]["listings"] if l["id"] == listing_id]
check("my listings shows partial sale", mine and mine[0]["sold"] == 1 and mine[0]["status"] == "active", mine)

s, r = call("cancel_listing", {"listing_id": listing_id}, token=tok_b)
check("can't cancel someone else's listing", s == 404, r)
s, r = call("cancel_listing", {"listing_id": listing_id}, token=tok_a)
check("A cancels the rest", s == 200 and have(r["data"]["state"], "healing_draught") == batch - 1, r)
check("cancel collects the rest of the deposit", s == 200 and r["data"]["state"]["player"]["gold"] == gold_a + 13 - deposit,
      (gold_a, deposit, r.get("data", {}).get("state", {}).get("player")))
s, r = call("buy_listing", {"listing_id": listing_id, "quantity": 1}, token=tok_b)
check("cancelled listing can't be bought", s == 409, r)

# ---------------------------------------------------------------- 0 gold: list anyway (#27), sell to guild (#28)
s, r = call("get_state", token=tok_b)
gold_b = r["data"]["player"]["gold"]
s, r = call("list_item", {"item_id": "healing_draught", "quantity": 1, "unit_price": gold_b, "duration_hours": 12}, token=tok_a)
check(f"A lists 1 draught at {gold_b} (all of B's gold)", s == 200, r)
drain_id = r["data"]["listing"]["listing_id"] if r.get("ok") else 0
s, r = call("buy_listing", {"listing_id": drain_id, "quantity": 1}, token=tok_b)
check("B spends every coin: 0 gold", s == 200 and r["data"]["state"]["player"]["gold"] == 0, r)

s, r = call("collect_station", {}, token=tok_b)
copper = have(r["data"]["state"], "copper_ore") if r.get("ok") else 0
check("B collects copper ore", copper >= 6, r)
s, r = call("list_item", {"item_id": "copper_ore", "quantity": 2, "unit_price": 5, "duration_hours": 12}, token=tok_b)
check("0-gold player can still list (#27)", s == 200 and r["data"]["state"]["player"]["gold"] == 0, r)
zero_id = r["data"]["listing"]["listing_id"] if r.get("ok") else 0
s, r = call("cancel_listing", {"listing_id": zero_id}, token=tok_b)
check("0-gold cancel works and waives the deposit", s == 200 and r["data"]["state"]["player"]["gold"] == 0
      and have(r["data"]["state"], "copper_ore") == copper and "waived" in r["data"]["state"]["activity"][0]["text"], r)

s, r = call("sell_quote", {"item_id": "copper_ore", "quantity": 3}, token=tok_b)
guild = r["data"].get("guild", {}) if r.get("ok") else {}
check("sell quote says copper ore is a raw material (#37)", r.get("data", {}).get("type") == "raw", r)
check("sell quote includes a guild offer", guild.get("total", 0) > 0 and guild["first_unit"] >= guild["last_unit"], r)
check("guild pays below the traders' quick sale", guild.get("first_unit", 99) <= r["data"]["trader_price"], (guild, r.get("data", {}).get("trader_price")))
s, r = call("sell_to_guild", {"item_id": "copper_ore", "quantity": 3, "expected_total": guild.get("total", 0)}, token=tok_b)
check("0-gold player sells to the guild instantly (#28)", s == 200 and r["data"]["state"]["player"]["gold"] == guild.get("total"), r)
check("guild sale consumed the ore", s == 200 and have(r["data"]["state"], "copper_ore") == copper - 3, r)
check("guild sale in activity", s == 200 and r["data"]["state"]["activity"][0]["type"] == "sold_to_guild", r)
gold_b = r["data"]["state"]["player"]["gold"] if r.get("ok") else 0

s, r = call("sell_quote", {"item_id": "copper_ore", "quantity": 3}, token=tok_b)
check("guild price drops after selling", s == 200 and r["data"]["guild"]["total"] < guild.get("total", 0), (guild, r))
s, r = call("sell_to_guild", {"item_id": "copper_ore", "quantity": 1, "expected_total": 999}, token=tok_b)
check("sale refused if the offer dropped below what was shown", s == 409 and r["error"]["code"] == "price_changed", r)
s, r = call("get_state", token=tok_b)
check("refused sale changed nothing", r["data"]["player"]["gold"] == gold_b and have(r["data"], "copper_ore") == copper - 3, r["data"]["player"])
s, r = call("sell_to_guild", {"item_id": "copper_ore", "quantity": 9999}, token=tok_b)
check("can't sell more than you have", s == 400 and r["error"]["code"] == "not_enough_items", r)
s, r = call("sell_to_guild", {"item_id": "dragon_scale", "quantity": 1}, token=tok_b)
check("unknown item rejected", s == 400, r)

# ---------------------------------------------------------------- feedback (#29)
s, r = call("feedback", {"message": "   ", "screen": "Workshop"}, token=tok_b)
check("empty feedback rejected", s == 400, r)
s, r = call("feedback", {"message": "x" * 1001, "screen": "Workshop"}, token=tok_b)
check("too-long feedback rejected", s == 400, r)
s, r = call("feedback", {"message": "Smoke test <b>feedback</b>", "screen": "Market/sell_form"})
check("feedback needs login", s == 401, r)
s, r = call("feedback", {"message": "Smoke test <b>feedback</b>", "screen": "Market/sell_form"}, token=tok_b)
check("feedback saved", s == 200 and r["data"]["saved"], r)
for _ in range(9):
    s, r = call("feedback", {"message": "more", "screen": "Bag"}, token=tok_b)
s, r = call("feedback", {"message": "one too many", "screen": "Bag"}, token=tok_b)
check("feedback limited to 10 an hour", s == 429 and r["error"]["code"] == "too_much_feedback", r)
s, page = get_raw("action=feedback_list&key=wrong-key")
check("feedback page hidden without the right key", s == 404, page[:200])
if FEEDBACK_KEY:
    s, page = get_raw(f"action=feedback_list&key={FEEDBACK_KEY}")
    check("feedback page shows the note, escaped, with player and screen",
          s == 200 and "Smoke test &lt;b&gt;feedback&lt;/b&gt;" in page and name_b in page and "Market/sell_form" in page, page[:300])
else:
    print("SKIP  feedback page (no --feedback-key)")

# ---------------------------------------------------------------- city: directory and profiles (#31)
s, r = call("players", {"sort": "wealth"}, token=tok_b)
golds = [p["gold"] for p in r["data"]["players"]] if r.get("ok") else []
check("directory sorted by gold", s == 200 and golds == sorted(golds, reverse=True) and r["data"]["me"]["name"] == name_b, r)
titled = [p for p in r["data"]["players"] if p.get("title")] if r.get("ok") else []
check("#1 by gold is 'Il Factotum della Città', and only them", len(titled) == 1 and titled[0]["rank"] == 1
      and titled[0]["title"] == "Il Factotum della Città", titled)
s2, r2 = call("player_profile", {"player_id": titled[0]["id"] if titled else 0}, token=tok_b)
check("the Factotum's profile shows the title", s2 == 200 and r2["data"].get("title") == "Il Factotum della Città", r2)
ids = {p["name"]: p["id"] for p in r["data"]["players"]} if r.get("ok") else {}
id_a, id_b = ids.get(name, 0), ids.get(name_b, 0)
check("directory lists both players", id_a and id_b, list(ids)[:5])
s, r = call("players", {"sort": "mastery"}, token=tok_b)
crafted = [p["crafted"] for p in r["data"]["players"]] if r.get("ok") else []
check("mastery sorted by crafts made", s == 200 and crafted == sorted(crafted, reverse=True), r)
s, r = call("players", {"sort": "beauty"}, token=tok_b)
check("unknown sort rejected", s == 400, r)
s, r = call("player_profile", {"player_id": id_a}, token=tok_b)
check("profile of A: guild, skill, crafts, recipes, can trade", s == 200 and r["data"]["profession"] == "Alchemist" and r["data"]["skill"] >= 2
      and r["data"]["rank_name"] == "Apprentice" and r["data"]["crafted"] >= batch and r["data"]["recipes_known"] == 1
      and r["data"]["recipes_total"] == len([x for x in RECIPES if x["profession"] == "alchemist" and not x.get("rare")]) and r["data"]["can_trade"], r)
s, r = call("player_profile", {"player_id": id_b}, token=tok_b)
check("own profile: can't trade with yourself", s == 200 and r["data"]["me"] and not r["data"]["can_trade"], r)
s, r = call("player_profile", {"player_id": 999999999}, token=tok_b)
check("unknown player -> 404", s == 404, r)

# ---------------------------------------------------------------- direct trades (#32)
def offer(tok, to, give=(), give_gold=0, ask=(), ask_gold=0, note=""):
    return call("offer_create", {"to_player_id": to, "give_items": [{"item_id": i, "quantity": q} for i, q in give],
                                 "give_gold": give_gold, "ask_items": [{"item_id": i, "quantity": q} for i, q in ask],
                                 "ask_gold": ask_gold, "note": note}, token=tok)

s, r = call("get_state", token=tok_b)
copper_b = have(r["data"], "copper_ore")
s, r = call("get_state", token=tok_a)
sun_a, copper_a = have(r["data"], "sunleaf"), have(r["data"], "copper_ore")

s, r = offer(tok_b, id_a, give=[("copper_ore", 1)])
check("gifts not allowed (nothing asked)", s == 400 and r["error"]["code"] == "no_gifts", r)
s, r = offer(tok_b, id_a, ask=[("sunleaf", 1)])
check("asking for free not allowed (nothing offered)", s == 400 and r["error"]["code"] == "no_gifts", r)
s, r = offer(tok_b, id_b, give=[("copper_ore", 1)], ask=[("sunleaf", 1)])
check("can't trade with yourself", s == 400, r)
s, r = offer(tok_b, id_a, give=[("copper_ore", 9999)], ask=[("sunleaf", 1)])
check("can't offer more than you have", s == 400 and r["error"]["code"] == "not_enough_items", r)
s, r = offer(tok_b, id_a, give=[("dragon_scale", 1)], ask=[("sunleaf", 1)])
check("unknown item rejected", s == 400, r)

s, r = offer(tok_b, id_a, give=[("copper_ore", 2)], ask=[("sunleaf", 2)], note="Copper for herbs?")
check("B offers 2 copper for 2 sunleaf", s == 200, r)
offer_id = r["data"]["offer"]["offer_id"] if r.get("ok") else 0
check("B's copper is held", s == 200 and have(r["data"]["state"], "copper_ore") == copper_b - 2, r)
check("B sees it under 'your offers'", s == 200 and r["data"]["offers"]["outgoing"][0]["id"] == offer_id, r)
s, r = call("get_state", token=tok_a)
check("A has 1 incoming offer (badge)", r["data"]["incoming_offers"] == 1, r["data"].get("incoming_offers"))
check("A's activity shows the offer", any(a["type"] == "offer_received" for a in r["data"]["activity"]), r["data"]["activity"][:2])
s, r = call("trade_offers", token=tok_a)
inc = r["data"]["incoming"][0] if r.get("ok") and r["data"]["incoming"] else {}
check("A's inbox: gets copper, gives sunleaf, with note", inc.get("you_get") == "2 Copper Ore" and inc.get("you_give") == "2 Sunleaf"
      and inc.get("note") == "Copper for herbs?", inc)
s, r = call("offer_accept", {"offer_id": offer_id}, token=tok_b)
check("sender can't accept own offer", s == 404, r)
s, r = call("offer_accept", {"offer_id": offer_id}, token=tok_a)
check("A accepts", s == 200, r)
check("A got copper and paid sunleaf", s == 200 and have(r["data"]["state"], "copper_ore") == copper_a + 2
      and have(r["data"]["state"], "sunleaf") == sun_a - 2 and r["data"]["state"]["incoming_offers"] == 0, r)
s, r = call("get_state", token=tok_b)
check("B got the sunleaf", have(r["data"], "sunleaf") == 2 and have(r["data"], "copper_ore") == copper_b - 2, r["data"]["inventory"])
check("B's activity says it was accepted", any(a["type"] == "offer_accepted" for a in r["data"]["activity"]), r["data"]["activity"][:2])
s, r = call("offer_accept", {"offer_id": offer_id}, token=tok_a)
check("can't accept twice", s == 409, r)

s, r = offer(tok_b, id_a, give=[("copper_ore", 1)], ask=[("sunleaf", 9999)])
check("B asks for more than A has", s == 200, r)
big_id = r["data"]["offer"]["offer_id"] if r.get("ok") else 0
s, r = call("offer_accept", {"offer_id": big_id}, token=tok_a)
check("accept refused when A lacks the items", s == 400 and r["error"]["code"] == "not_enough_items", r)
s, r = call("trade_offers", token=tok_a)
check("refused offer is still open", any(o["id"] == big_id for o in r["data"]["incoming"]), r["data"])
s, r = call("offer_decline", {"offer_id": big_id}, token=tok_a)
check("A declines", s == 200, r)
s, r = call("get_state", token=tok_b)
check("declined: B's copper came back", have(r["data"], "copper_ore") == copper_b - 2, r["data"]["inventory"])

s, r = offer(tok_b, id_a, give=[("copper_ore", 1)], ask=[("sunleaf", 1)])
cancel_id = r["data"]["offer"]["offer_id"] if r.get("ok") else 0
s, r = call("offer_cancel", {"offer_id": cancel_id}, token=tok_a)
check("only the sender can cancel", s == 404, r)
s, r = call("offer_cancel", {"offer_id": cancel_id}, token=tok_b)
check("B cancels; copper back", s == 200 and have(r["data"]["state"], "copper_ore") == copper_b - 2, r)
s, r = call("offer_decline", {"offer_id": cancel_id}, token=tok_a)
check("cancelled offer can't be declined", s == 409, r)

s, r = call("get_state", token=tok_b)
gold_b = r["data"]["player"]["gold"]
s, r = call("get_state", token=tok_a)
gold_a = r["data"]["player"]["gold"]
s, r = offer(tok_a, id_b, give=[("sunleaf", 1)], ask_gold=1)
gold_offer = r["data"]["offer"]["offer_id"] if r.get("ok") else 0
s, r = call("offer_accept", {"offer_id": gold_offer}, token=tok_b)
check("gold changes hands on accept", s == 200 and r["data"]["state"]["player"]["gold"] == gold_b - 1, r)
s, r = call("get_state", token=tok_a)
check("A received the gold", r["data"]["player"]["gold"] == gold_a + 1, r["data"]["player"])

open_ids = []
for _ in range(5):
    s, r = offer(tok_b, id_a, give=[("copper_ore", 1)], ask=[("sunleaf", 1)])
    if r.get("ok"):
        open_ids.append(r["data"]["offer"]["offer_id"])
s, r = offer(tok_b, id_a, give=[("copper_ore", 1)], ask=[("sunleaf", 1)])
check("at most 5 open offers", len(open_ids) == 5 and s == 400 and r["error"]["code"] == "too_many_offers", (len(open_ids), r))
for oid in open_ids:
    call("offer_cancel", {"offer_id": oid}, token=tok_b)
s, r = call("trade_offers", token=tok_b)
check("all cleaned up", s == 200 and not r["data"]["outgoing"] and len(r["data"]["closed"]) >= 5, r["data"])

# ---------------------------------------------------------------- order board (#44)
s, r = call("orders", token=tok_a)
board = r["data"] if r.get("ok") else {}
orders = board.get("orders", [])
check("order board has 3 orders", s == 200 and len(orders) == 3, r)
check("orders have items, a customer and a reward", all(o["items"] and o["customer"] and o["reward_gold"] > 0 for o in orders), orders)
check("orders name their customer's id (for the 3D customer's look)", all(o["customer_id"] for o in orders), [o.get("customer_id") for o in orders])
check("Apprentice: no bundle orders", all(o["kind"] in ("standard", "collector") for o in orders), [o["kind"] for o in orders])
check("standard orders pay more than market value", all(o["reward_gold"] > 0 for o in orders), orders)
check("orders pay XP (#30)", all(o["reward_xp"] > 0 for o in orders), [o.get("reward_xp") for o in orders])
# 0.12.0: an Apprentice's rare-material reward is never a raw unlocked above their skill (raws 3 and 4 are 40 and 65).
second_raws = {g["station"]["outputs"][1]["item_id"] for g in GUILDS}
check("Apprentice order rewards: only second raws as rare materials", all(i["item_id"] in second_raws for o in orders for i in o.get("reward_items", [])),
      [o.get("reward_items") for o in orders])
check("Apprentice orders only ask for goods you know or can learn now", all(i["item_id"] == "healing_draught" for o in orders for i in o["items"]),
      [[i["item_id"] for i in o["items"]] for o in orders])
rare_offers = [o["reward_recipe"]["id"] for o in orders if o.get("reward_recipe")]
check("a rare recipe is offered at most once on a board (#49)", len(rare_offers) == len(set(rare_offers)), rare_offers)
s, r = call("orders", token=tok_b)
b_order = r["data"]["orders"][0]["id"] if r.get("ok") else 0
s, r = call("order_fill", {"order_id": b_order}, token=tok_a)
check("can't fill another player's order", s == 404, r)
short = [o for o in orders if any(i["have"] < i["quantity"] for i in o["items"])]
if short:
    s, r = call("order_fill", {"order_id": short[0]["id"]}, token=tok_a)
    check("can't fill an order without the items", s == 400 and r["error"]["code"] == "not_enough_items", r)
s, r = call("order_skip", {"order_id": orders[0]["id"]}, token=tok_a)
check("turn down an order: a new one arrives at once", s == 200 and len(r["data"]["board"]["orders"]) == 3
      and orders[0]["id"] not in [o["id"] for o in r["data"]["board"]["orders"]] and r["data"]["board"]["skip_in"] > 0, r)
s, r = call("order_skip", {"order_id": r["data"]["board"]["orders"][1]["id"] if r.get("ok") else 0}, token=tok_a)
check("second skip waits for the cooldown", s == 409 and r["error"]["code"] == "skip_cooldown", r)

# Race (0.5.2): a new player's board loaded by several requests at the same moment gets exactly 3 orders.
name_c, pw_c, tok_c, r = register("c")
call("choose_profession", {"profession_id": "leatherworker"}, token=tok_c)
with ThreadPoolExecutor(max_workers=6) as pool:
    results = list(pool.map(lambda _: call("orders", token=tok_c), range(6)))
check("6 board loads at once all succeed", all(s == 200 for s, _ in results), [s for s, _ in results])
s, r = call("orders", token=tok_c)
slots = [o["slot"] for o in r["data"]["orders"]] if r.get("ok") else []
check("no duplicate orders from loads at the same moment", sorted(slots) == [0, 1, 2], slots)


# ---------------------------------------------------------------- skill, XP and the guild trainer (#30, #49)
def station_ready(tok, item_id):
    s, r = call("get_state", token=tok)
    return next((o["ready"] for o in r["data"]["profession"]["station"]["outputs"] if o["item_id"] == item_id), 0)


def craft_and_collect(tok, recipe_id, qty):
    s, r = call("start_craft", {"recipe_id": recipe_id, "quantity": qty}, token=tok)
    if s != 200:
        return s, r
    wait_for_crafts(tok)
    return call("collect_crafts", {}, token=tok)


def wait_for_ore(tok, item_id, need, timeout=150):
    """Collect from the station until the player has `need` of a raw (the CI pace makes 1 copper ore per ~6 s)."""
    end = time.time() + timeout
    while time.time() < end:
        s, r = call("get_state", token=tok)
        missing = need - have(r["data"], item_id)
        if missing <= 0:
            return True
        if station_ready(tok, item_id) >= missing:
            call("collect_station", {}, token=tok)
            continue
        time.sleep(3)
    return False


name_d, pw_d, tok_d, r = register("d")
s, r = call("choose_profession", {"profession_id": "blacksmith"}, token=tok_d)
st = r["data"]
check("new blacksmith knows only Brass Fittings", [x["id"] for x in st["profession"]["recipes"]] == ["brass_fittings"], st["profession"]["recipes"])
check("new blacksmith's mine yields copper only; iron ore at skill 15",
      [o["item_id"] for o in st["profession"]["station"]["outputs"]] == ["copper_ore"]
      and st["profession"]["station"]["locked"][0]["unlock_skill"] == 15, st["profession"]["station"])
bs_locked = [(o["item_id"], o["unlock_skill"]) for g in GUILDS if g["id"] == "blacksmith" for o in g["station"]["outputs"] if o.get("unlock_skill", 1) > 1]
check("the mine's later raws stay locked until their skill (0.12.0: coal at 40, silver at 65)",
      [(x["item_id"], x["unlock_skill"]) for x in st["profession"]["station"]["locked"]] == bs_locked, st["profession"]["station"]["locked"])
for rid, why in (("copper_lantern", "trainer"), ("iron_sword", "trainer"), ("arsenale_fittings", "rare")):
    s, r = call("start_craft", {"recipe_id": rid, "quantity": 1}, token=tok_d)
    check(f"can't craft unknown {rid}", s == 400 and r["error"]["code"] == "recipe_not_known" and why in r["error"]["message"], r)

s, r = call("trainer", token=tok_d)
tr = {x["id"]: x for x in r["data"]["recipes"]} if s == 200 else {}
n_bs = len([x for x in RECIPES if x["profession"] == "blacksmith"])
check(f"trainer lists all {n_bs} blacksmith recipes", s == 200 and len(tr) == n_bs and r["data"]["trainer"], r)
check("trainer: Brass Fittings known (free starter)", tr.get("brass_fittings", {}).get("status") == "known" and tr["brass_fittings"]["starter"], tr.get("brass_fittings"))
check("trainer: Copper Lantern at skill 6 for 50 ducats", tr.get("copper_lantern", {}).get("status") == "locked"
      and tr["copper_lantern"]["skill"] == 6 and tr["copper_lantern"]["price"] == 50, tr.get("copper_lantern"))
check("trainer: Iron Sword is Journeyman, 200 ducats", tr.get("iron_sword", {}).get("rank") == "Journeyman" and tr["iron_sword"]["price"] == 200, tr.get("iron_sword"))
check("trainer shows other guilds' goods and the +25% trade bonus", tr.get("iron_ingot", {}).get("imports_from") == ["Alchemist"]
      and next(i for i in tr["iron_ingot"]["inputs"] if i["item_id"] == "smelting_flux")["guild"] == "Alchemist"
      and tr["iron_ingot"]["xp_each"] == 25 and tr["iron_ingot"]["colour"] == "orange", tr.get("iron_ingot"))
check("trainer: rare recipes only from customers", tr.get("arsenale_fittings", {}).get("status") == "rare" and tr["arsenale_fittings"]["rare"], tr.get("arsenale_fittings"))

for rid, code, label in (("copper_lantern", "skill_too_low", "skill too low"), ("arsenale_fittings", "rare_recipe", "rare recipe"),
                         ("healing_draught", "wrong_profession", "another guild's recipe"), ("brass_fittings", "already_known", "already known"),
                         ("dragon_blade", "unknown_recipe", "unknown recipe")):
    s, r = call("learn_recipe", {"recipe_id": rid}, token=tok_d)
    check(f"trainer refuses: {label}", s in (400, 409) and r["error"]["code"] == code, r)
s, r = call("get_state", token=tok_d)
check("refused lessons cost nothing", r["data"]["player"]["gold"] == 150, r["data"]["player"])

call("collect_station", {}, token=tok_d)
s, r = craft_and_collect(tok_d, "brass_fittings", 1)
pr = r["data"].get("progress", {}) if s == 200 else {}
check("first brass: 10 XP doubled = 20, +1 skill for the discovery -> skill 2", pr.get("xp") == 20 and pr.get("doubled") is True
      and pr.get("skill_to") == 2 and r["data"]["state"]["profession"]["progress"]["xp"] == 20, r)
s, r = craft_and_collect(tok_d, "brass_fittings", 6)
pr = r["data"].get("progress", {}) if s == 200 else {}
check("6 more: 60 XP, no double, no discovery -> skill 5", pr.get("xp") == 60 and pr.get("doubled") is False and not pr.get("discoveries")
      and pr.get("skill_to") == 5, r)
check("D: waiting for copper ore at the mine", wait_for_ore(tok_d, "copper_ore", 9), "timed out")
s, r = craft_and_collect(tok_d, "brass_fittings", 3)
check("3 more: skill 6", s == 200 and r["data"]["progress"]["skill_to"] == 6, r)
brass = next(x for x in r["data"]["state"]["profession"]["recipes"] if x["id"] == "brass_fittings") if s == 200 else {}
check("Brass Fittings turned yellow at skill 6 (60%: 6 XP)", brass.get("colour") == "yellow" and brass.get("xp_each") == 6, brass)

s, r = call("learn_recipe", {"recipe_id": "copper_lantern"}, token=tok_d)
check("learn Copper Lantern at the trainer", s == 200 and r["data"]["learned"]["price"] == 50
      and r["data"]["state"]["player"]["gold"] == 100, r)
check("lantern now known, orange, 10 XP", s == 200 and any(x["id"] == "copper_lantern" and x["colour"] == "orange" and x["xp_each"] == 10
      for x in r["data"]["state"]["profession"]["recipes"]), r)
check("lesson in activity", s == 200 and r["data"]["state"]["activity"][0]["type"] == "recipe_learned", r)
s, r = call("learn_recipe", {"recipe_id": "copper_lantern"}, token=tok_d)
check("can't buy the same recipe twice", s == 409 and r["error"]["code"] == "already_known", r)

def tool(*parts):
    subprocess.run(" ".join([PLAYER_TOOL, *[str(x) for x in parts]]), shell=True, check=True, capture_output=True)


if PLAYER_TOOL:
    # The rank gate (0.11.0, #51): at 25 an Apprentice in the rundown shack is capped; crafts give no XP.
    tool("skill", name_d, 25)
    s, r = craft_and_collect(tok_d, "copper_lantern", 1)
    pr = r["data"].get("progress", {}) if s == 200 else {}
    check("at the shack's cap (25) a craft gives no XP and no skill", s == 200 and pr.get("skill_to") == 25 and pr.get("xp") == 0
          and pr.get("capped") is True and pr.get("rank_up") is None, r)
    st = r["data"]["state"]["profession"] if s == 200 else {}
    check("state: capped at 25, the Bellows forge opens Journeyman", st.get("progress", {}).get("at_cap") is True and st["progress"]["cap"] == 25
          and st["workshop"]["level"] == 1 and st["workshop"]["next"]["name"] == "Bellows forge" and st["workshop"]["next"]["opens_rank"] == "Journeyman"
          and st["workshop"]["next"]["needs_skill"] == 25 and r["data"]["state"]["craft_slots"] == 2, st.get("workshop"))
    s, r = call("workshop_open", {}, token=tok_d)
    check("nothing to open before building", s == 409 and r["error"]["code"] == "nothing_building", r)
    s, r = call("workshop_upgrade", {}, token=tok_d)
    check("can't build without the ducats and goods", s in (400, 409) and r["error"]["code"] in ("not_enough_gold", "not_enough_items"), r)
    s, r = call("get_state", token=tok_d)
    check("a refused upgrade costs nothing", r["data"]["profession"]["workshop"]["building"] is None and r["data"]["player"]["gold"] == 100, r["data"]["player"])
    for item, q in (("leather_grip", 10), ("smelting_flux", 4), ("brass_fittings", 10)):
        tool("give", name_d, item, q)
    tool("gold", name_d, 1000)
    s, r = call("workshop_upgrade", {}, token=tok_d)
    w = r["data"]["state"]["profession"]["workshop"] if s == 200 else {}
    check("build the Bellows forge: ducats and goods taken, builders at work", s == 200 and r["data"]["state"]["player"]["gold"] == 850
          and have(r["data"]["state"], "leather_grip") == 0 and w["building"]["name"] == "Bellows forge" and w["building"]["ready"] is False, r)
    s, r = call("workshop_upgrade", {}, token=tok_d)
    check("one build at a time", s == 409 and r["error"]["code"] == "already_building", r)
    s, r = call("workshop_open", {}, token=tok_d)
    check("can't open it before it's finished", s == 409 and r["error"]["code"] == "not_ready", r)
    tool("build_ready", name_d)
    s, r = call("workshop_open", {}, token=tok_d)
    pr = (r["data"]["built"].get("progress") or {}) if s == 200 else {}
    check("open the Bellows forge: level 2, a repaired workshop", s == 200 and r["data"]["built"]["level"] == 2
          and r["data"]["built"]["look"] == "Repaired workshop", r)
    check("rank-up: Journeyman at 26", pr.get("skill_to") == 26 and pr.get("rank_up") == "Journeyman", r)
    check("rank-up teaches the Journeyman starter free (Iron Ingot)", pr.get("learned") == ["Iron Ingot"]
          and any(x["id"] == "iron_ingot" for x in r["data"]["state"]["profession"]["recipes"]), pr)
    check("passing skill 15 opens iron ore at the mine; later raws stay locked", pr.get("unlocked") == ["Iron Ore"]
          and all(x["unlock_skill"] > 26 for x in r["data"]["state"]["profession"]["station"]["locked"]), r["data"]["state"]["profession"]["station"])
    check("rank-up in activity", any(a["type"] == "rank_up" and "Journeyman Blacksmith" in a["text"] for a in r["data"]["state"]["activity"]), r["data"]["state"]["activity"][:5])
    st = r["data"]["state"]["profession"]["progress"]
    check("header data: Blacksmith 26/100 · Journeyman, Expert next at 51", st["skill"] == 26 and st["rank"] == "Journeyman"
          and st["next_rank"] == {"name": "Expert", "at": 51}, st)
    check("level 2: three craft slots, cap 50, the next upgrade listed", r["data"]["state"]["craft_slots"] == 3 and st["cap"] == 50
          and r["data"]["state"]["profession"]["workshop"]["next"]["level"] == 3, r["data"]["state"]["profession"]["workshop"])
    check("the build is in the activity log", any(a["type"] == "workshop_built" for a in r["data"]["state"]["activity"]), r["data"]["state"]["activity"][:4])
    s, r = call("workshop_open", {}, token=tok_d)
    check("opening twice does nothing", s == 409 and r["error"]["code"] == "nothing_building", r)

    # Machine running costs (0.16.0, #52): the two-storey bottega burns lamp oil and pays daily wages, or crafts by hand.
    name_m, _, tok_m, _ = register("m")
    call("choose_profession", {"profession_id": "blacksmith"}, token=tok_m)
    tool("skill", name_m, 50)
    for item, q in (("leather_grip", 10), ("smelting_flux", 4), ("brass_fittings", 10), ("cured_leather", 10),
                    ("steam_tonic", 8), ("iron_ingot", 10), ("copper_ore", 12)):
        tool("give", name_m, item, q)
    tool("gold", name_m, 1150)
    for _ in (2, 3):
        call("workshop_upgrade", {}, token=tok_m)
        tool("build_ready", name_m)
        s, r = call("workshop_open", {}, token=tok_m)
    st = r["data"]["state"] if s == 200 else {}
    w = st.get("profession", {}).get("workshop", {})
    run = w.get("running") or {}
    check("level 3: the machines need lamp oil and wages", w.get("level") == 3 and run.get("fuel_item_id") == "lamp_oil"
          and run.get("wages_per_day", 0) > 0 and run.get("fuel_have") == 0 and run.get("wages_paid_today") is False, w)
    gold0 = st.get("player", {}).get("gold")
    lantern = next((x for x in st.get("profession", {}).get("recipes", []) if x["id"] == "copper_lantern"), {})
    check("recipe cards show the lamp oil and the time by hand", lantern.get("lamp_oil_each", 0) > 0
          and lantern.get("seconds_each_by_hand", 0) >= lantern.get("seconds_each", 1), lantern)
    s, r = call("start_craft", {"recipe_id": "copper_lantern", "quantity": 1}, token=tok_m)
    check("no lamp oil: made by hand, nothing taken", s == 200 and r["data"]["player"]["gold"] == gold0
          and "by hand" in r["data"]["activity"][0]["text"], r["data"]["activity"][:2] if s == 200 else r)
    tool("give", name_m, "lamp_oil", 3)
    s, r = call("start_craft", {"recipe_id": "copper_lantern", "quantity": 1}, token=tok_m)
    wages = run.get("wages_per_day", 0)
    check("with lamp oil: the machines burn 1 and today's wages are paid", s == 200 and r["data"]["player"]["gold"] == gold0 - wages
          and have(r["data"], "lamp_oil") == 2 and "Machines: burned 1 Lamp Oil" in r["data"]["activity"][0]["text"]
          and r["data"]["profession"]["workshop"]["running"]["wages_paid_today"] is True, r["data"]["activity"][:2] if s == 200 else r)
    s, r = call("start_craft", {"recipe_id": "copper_lantern", "quantity": 1}, token=tok_m)
    check("wages once a day: the next craft only burns oil", s == 200 and r["data"]["player"]["gold"] == gold0 - wages
          and have(r["data"], "lamp_oil") == 1, r["data"]["activity"][:2] if s == 200 else r)

    # Players from before 0.8.0 (#30): skill replayed from past crafts, every guild recipe kept, both raws kept.
    subprocess.run(f"{PLAYER_TOOL} legacy {name_d}", shell=True, check=True, capture_output=True)
    s, r = call("get_state", token=tok_d)
    st = r["data"]["profession"]
    check("legacy player: skill counted from past crafts", st["progress"]["skill"] == 6, st["progress"])
    check("legacy player keeps every guild recipe (not the rare ones)", sorted(x["id"] for x in st["recipes"])
          == ["brass_fittings", "copper_lantern", "iron_ingot", "iron_sword"], st["recipes"])   # the recipes of that time, not the 0.12.0 ladder
    check("legacy player keeps both raws", [o["item_id"] for o in st["station"]["outputs"]] == ["copper_ore", "iron_ore"], st["station"])
    check("legacy upgrade in activity", any(a["type"] == "skill_counted" for a in r["data"]["activity"]), r["data"]["activity"][:3])
    s, r = call("start_craft", {"recipe_id": "iron_sword", "quantity": 1}, token=tok_d)
    check("legacy player may craft a recipe above their skill", s == 400 and r["error"]["code"] == "not_enough_items", r)
    s, r = call("get_state", token=tok_d)
    check("the upgrade runs once", r["data"]["profession"]["progress"]["skill"] == 6
          and sum(a["type"] == "skill_counted" for a in r["data"]["activity"]) == 1, r["data"]["activity"][:4])
else:
    print("SKIP  rank-up and pre-0.8.0 players (no --player-tool)")

# ---------------------------------------------------------------- ticker (#45), news (#46), activity since (#47)
s, r = call("market", token=tok_a)
row = next((i for i in r["data"]["items"] if i["item_id"] == "iron_sword"), {}) if r.get("ok") else {}
check("market rows have usual price, % vs usual and a sparkline", {"usual", "change_pct", "hot", "spark"} <= set(row), row)
news = r["data"].get("news", []) if r.get("ok") else []
check("news board starts with today's Guild Week day", news and news[0]["kind"] == "week" and news[0]["title"], news)
s, r = call("market_item", {"item_id": "iron_sword"}, token=tok_a)
check("item detail has ticker fields", s == 200 and {"usual", "change_pct", "spark"} <= set(r["data"]), r)
s, r = call("news", token=tok_a)
check("news action", s == 200 and r["data"]["news"][0]["kind"] == "week", r)
s, r = call("activity", token=tok_a, query="&since=1")
check("activity since a time (return screen)", s == 200 and len(r["data"]["activity"]) > 0, r)
s, r = call("activity", token=tok_a, query="&since=4000000000")
check("nothing happened in the future", s == 200 and r["data"]["activity"] == [], r)

# ---------------------------------------------------------------- the living city (0.9.0): presence pass, friends, quarters
s, r = call("presence_token", token=tok_a)
pt = r["data"] if r.get("ok") else {}
check("presence pass: who I am (guild, look, slaps on by default)", s == 200 and pt["me"]["id"] == id_a
      and pt["me"]["profession"] == "alchemist" and 0 <= pt["me"]["look"] < 6 and pt["me"]["slaps"] is True, r)
if pt.get("enabled"):
    import base64, hashlib, hmac
    body64, sig = pt["token"].split(".")
    claims = json.loads(base64.urlsafe_b64decode(body64 + "=" * (-len(body64) % 4)))
    check("presence pass carries name, guild and a 10-minute expiry", claims["pid"] == id_a and claims["n"] == name
          and claims["p"] == "alchemist" and 0 < claims["exp"] - time.time() <= 600, claims)
    check("presence pass lists one room: the Palazzo (0.13.0: no guild quarters)", claims.get("q") == ["palazzo"], claims)
    check("presence pass has a realtime url", pt["url"].startswith(("ws://", "wss://")), pt)
else:
    print("SKIP  presence pass signature (no realtime_url/realtime_secret in config.php)")
    check("presence pass carries the look, hat and rank (0.10.0)", claims["l"] == pt["me"]["look"] and claims["ht"] == pt["me"]["hat"]
          and claims["r"] == pt["me"]["rank"], claims)
s, r = call("presence_token", token=register("np")[2])
check("no presence pass before joining a guild", s == 409, r)

# Looks (0.10.0, migration 008): chosen when joining a guild, or later; older accounts keep the 0.9.0 look.
check("an account that never chose keeps the old look", pt["me"]["look"] == id_a % 6 and pt["me"]["hat"] == 0
      and pt["me"]["look_chosen"] is False and pt["me"]["rank"] in (0, 1, 2, 3), pt.get("me"))
s, r = call("city_look", {"color": 4, "hat": 2}, token=tok_a)
check("choose a look", s == 200 and r["data"] == {"color": 4, "hat": 2, "chosen": True, "rank": pt["me"]["rank"]}, r)
s, r = call("presence_token", token=tok_a)
check("the pass carries the chosen look", s == 200 and r["data"]["me"]["look"] == 4 and r["data"]["me"]["hat"] == 2
      and r["data"]["me"]["look_chosen"] is True and r["data"]["me"]["slaps"] is True, r)
s, r = call("city_look", {"color": 6, "hat": 0}, token=tok_a)
check("body color must be 0-5", s == 400, r)
s, r = call("city_look", {"color": 1, "hat": 3}, token=tok_a)
check("hat must be 0-2", s == 400, r)
_, _, tok_look, _ = register("lk")
s, r = call("choose_profession", {"profession_id": "leatherworker", "look_color": 9, "look_hat": 1}, token=tok_look)
check("joining with a bad look is refused (and nothing is joined)", s == 400, r)
s, r = call("choose_profession", {"profession_id": "leatherworker", "look_color": 2, "look_hat": 1}, token=tok_look)
check("join a guild with a chosen look", s == 200, r)
s, r = call("presence_token", token=tok_look)
check("the new merchant has the look chosen at signup", s == 200 and r["data"]["me"]["look"] == 2 and r["data"]["me"]["hat"] == 1
      and r["data"]["me"]["look_chosen"] is True and r["data"]["me"]["profession"] == "leatherworker", r)
s, r = call("city_prefs", {"slaps": False}, token=tok_a)
check("turn slaps off", s == 200 and r["data"]["slaps"] is False, r)
s, r = call("presence_token", token=tok_a)
check("the pass says slaps are off", s == 200 and r["data"]["me"]["slaps"] is False, r)
s, r = call("city_prefs", {"slaps": "no"}, token=tok_a)
check("slaps must be true or false", s == 400, r)
call("city_prefs", {"slaps": True}, token=tok_a)

s, r = call("friend_add", {"player_id": id_b}, token=tok_a)
check("add a friend", s == 200 and [f["id"] for f in r["data"]["friends"]] == [id_b] and r["data"]["friends"][0]["friend"], r)
s, r = call("friend_add", {"player_id": id_b}, token=tok_a)
check("adding twice is harmless", s == 200 and len(r["data"]["friends"]) == 1, r)
s, r = call("friend_add", {"player_id": id_a}, token=tok_a)
check("can't friend yourself", s == 400, r)
s, r = call("friend_add", {"player_id": 999999999}, token=tok_a)
check("can't friend an unknown player", s == 404, r)
s, r = call("player_profile", {"player_id": id_b}, token=tok_a)
check("profile says they're a friend", s == 200 and r["data"]["friend"] is True and r["data"]["profession_id"] == "blacksmith", r)
s, r = call("friends", token=tok_a)
fr = r["data"]["friends"] if r.get("ok") else []
check("the friends list shows a friend's stall card, with an echo of what they did lately", s == 200 and fr and fr[0]["id"] == id_b, fr)
s, r = call("quarter", {"quarter": "alchemist"}, token=tok_a)
check("the guild quarters are gone (0.13.0)", s in (400, 404), r)
s, r = call("friend_remove", {"player_id": id_b}, token=tok_a)
check("remove a friend", s == 200 and r["data"]["friends"] == [], r)

# ---------------------------------------------------------------- npc market (local only)
if TICK:
    subprocess.run(TICK, shell=True, check=True, capture_output=True)
    s, r = call("market_item", {"item_id": "iron_ore"}, token=tok_a)
    npc = [l for l in r["data"]["listings"] if l["is_npc"]]
    check("tick: guild suppliers stock every item at the ceiling", npc and npc[0]["unit_price"] == r["data"]["ceiling"], r["data"])

    # A lists cheaply -> traders buy on next tick
    call("list_item", {"item_id": "healing_draught", "quantity": 1, "unit_price": 7, "duration_hours": 12}, token=tok_a)
    s, r = call("get_state", token=tok_a)
    gold_before = r["data"]["player"]["gold"]
    subprocess.run(TICK, shell=True, check=True, capture_output=True)
    s, r = call("get_state", token=tok_a)
    check("tick: traders buy underpriced listings", r["data"]["player"]["gold"] > gold_before, (gold_before, r["data"]["player"]))
    check("tick: sale to an NPC shows in activity", any(a["type"] == "sold" and "trader" in a["text"] for a in r["data"]["activity"]), r["data"]["activity"][:3])
    check("tick: the sale says which kind of buyer it was (0.10.0)", any(a["type"] == "sold" and a.get("sale", {}).get("buyer") == "traders"
          and a["sale"]["quantity"] == 1 for a in r["data"]["activity"]), r["data"]["activity"][:3])

    # A buys another guild's input from the suppliers (always available). B was drained to ~0 gold above.
    s, r = call("market_item", {"item_id": "brass_fittings"}, token=tok_a)
    sup = next(l for l in r["data"]["listings"] if l["is_npc"])
    s, r = call("buy_listing", {"listing_id": sup["id"], "quantity": 1}, token=tok_a)
    check("buy from guild suppliers", s == 200 and have(r["data"]["state"], "brass_fittings") == 1, r)
    # Ticks record price history for the ticker's sparklines (#45).
    s, r = call("market_item", {"item_id": "iron_sword"}, token=tok_a)
    check("tick: price history recorded", s == 200 and len(r["data"]["spark"]) >= 1, r["data"].get("spark"))

    # Fill an order (#44): buy what's missing from the Guild Suppliers, then hand it over.
    s, r = call("orders", token=tok_a)
    ready = [o for o in r["data"]["orders"] if o["arriving_in"] == 0]
    filled = False
    for o in sorted(ready, key=lambda o: (not o.get("reward_recipe"), sum(i["quantity"] for i in o["items"]))):
        ok = True
        for it in o["items"]:
            need = it["quantity"] - it["have"]
            if need <= 0:
                continue
            s2, mi = call("market_item", {"item_id": it["item_id"]}, token=tok_a)
            sup = [l for l in mi["data"]["listings"] if l["is_npc"] and l["quantity"] >= need]
            if not sup:
                ok = False
                break
            s2, b = call("buy_listing", {"listing_id": sup[0]["id"], "quantity": need}, token=tok_a)
            ok = ok and s2 == 200
        if not ok:
            continue
        s, before = call("get_state", token=tok_a)
        gold_before = before["data"]["player"]["gold"]
        s, r = call("order_fill", {"order_id": o["id"]}, token=tok_a)
        check("fill an order: paid its reward", s == 200 and r["data"]["state"]["player"]["gold"] == gold_before + o["reward_gold"], r)
        check("filled order is replaced by a customer on the way", s == 200 and any(x["arriving_in"] > 0 for x in r["data"]["board"]["orders"]), r)
        check("order shows in activity", s == 200 and any(a["type"] == "order_filled" for a in r["data"]["state"]["activity"][:4]), r)
        fp = r["data"]["filled"].get("progress", {}) if s == 200 else {}
        check("filling an order pays the XP it showed (#30)", fp.get("xp") == o["reward_xp"] and fp.get("xp", 0) > 0, (fp, o.get("reward_xp")))
        if o.get("reward_recipe"):
            rid = o["reward_recipe"]["id"]
            check("the customer taught the rare recipe (#49)", fp.get("taught") == o["reward_recipe"]["name"]
                  and rid in [x["id"] for x in r["data"]["state"]["profession"]["recipes"]], (fp, o["reward_recipe"]))
            check("rare recipe in activity", any(a["type"] == "recipe_taught" for a in r["data"]["state"]["activity"][:5]), r["data"]["state"]["activity"][:5])
            s2, t = call("trainer", token=tok_a)
            check("trainer lists the rare recipe as known", s2 == 200 and next(x for x in t["data"]["recipes"] if x["id"] == rid)["status"] == "known", t)
            s2, b2 = call("orders", token=tok_a)
            check("no order offers a rare recipe you already know", all((x.get("reward_recipe") or {}).get("id") != rid for x in b2["data"]["orders"]), b2)
        else:
            print("SKIP  rare recipe from an order (none offered: the CI content sets rare_recipe_chance to 1)")
        s, r = call("order_fill", {"order_id": o["id"]}, token=tok_a)
        check("can't fill the same order twice", s == 409, r)
        filled = True
        break
    if not filled:
        print("SKIP  fill an order (couldn't afford any order's items from the suppliers)")

    # Exploit guard (0.5.1): no order may be worth more than buying its items from the Guild Suppliers.
    # (A tick first: filling the order above may have bought the suppliers' whole stock of that item.)
    subprocess.run(TICK, shell=True, check=True, capture_output=True)
    s, mk = call("market", token=tok_a)
    usual = {i["item_id"]: i["usual"] for i in mk["data"]["items"]}
    supplier_price = {}
    for item_id in usual:
        s2, mi = call("market_item", {"item_id": item_id}, token=tok_a)
        npc = [l["unit_price"] for l in mi["data"]["listings"] if l["is_npc"] and l["seller"] == SUPPLIERS]
        supplier_price[item_id] = min(npc) if npc else None
    s, r = call("orders", token=tok_a)
    profitable = []
    for o in r["data"]["orders"]:
        cost = sum(i["quantity"] * supplier_price[i["item_id"]] for i in o["items"] if supplier_price[i["item_id"]])
        worth = o["reward_gold"] + sum(x["quantity"] * usual[x["item_id"]] for x in o["reward_items"])
        if worth >= cost:
            profitable.append((o["customer"], o["kind"], worth, cost))
    check("no order can be filled at a profit from the Guild Suppliers", not profitable and all(supplier_price.values()), profitable)

    # Exploit guard (0.5.1): two players trading a raw at 20x between themselves don't move its price.
    s, r = call("market_item", {"item_id": "copper_ore"}, token=tok_b)
    usual_cu = r["data"]["usual"]
    s, r = call("list_item", {"item_id": "copper_ore", "quantity": 1, "unit_price": usual_cu * 20, "duration_hours": 12}, token=tok_b)
    wash_id = r["data"]["listing"]["listing_id"] if r.get("ok") else 0
    s, r = call("buy_listing", {"listing_id": wash_id, "quantity": 1}, token=tok_a)
    check("wash trade at 20x goes through (it's allowed, just pointless)", s == 200, r)
    subprocess.run(TICK, shell=True, check=True, capture_output=True)
    s, r = call("market_item", {"item_id": "copper_ore"}, token=tok_a)
    check("wash trade doesn't pump the raw price", s == 200 and r["data"]["reference"] <= usual_cu * 1.5, (usual_cu, r["data"].get("reference")))
else:
    print("SKIP  market tick checks (no --tick command)")

# ---------------------------------------------------------------- the Duke's order (0.9.0)
s, r = call("duke_order", token=tok_a)
duke = r["data"] if r.get("ok") else {}
check("the Duke's order: open, with lines from at least two guilds", s == 200 and duke["status"] == "open"
      and len({l["guild"] for l in duke["lines"]}) >= 2 and duke["seconds_left"] > 0, r)
line = duke["lines"][0] if duke.get("lines") else {}
s, mi = call("market_item", {"item_id": line.get("item_id", "")}, token=tok_a)
usual_line = mi["data"]["usual"] if mi.get("ok") else 0
sup = [l for l in mi["data"]["listings"] if l["is_npc"] and l["seller"] == SUPPLIERS] if mi.get("ok") else []
check("Duke pays 1.25 x usual now, 0.15 x on completion", line.get("unit_pay") == int(usual_line * 1.25)
      and line.get("unit_bonus") == int(usual_line * 0.15), (line, usual_line))
check("Duke's whole reward is below the suppliers' price (no supplier profit)",
      sup and line["unit_pay"] + line["unit_bonus"] < min(l["unit_price"] for l in sup), (line, sup[:1]))
s, r = call("duke_contribute", {"item_id": line.get("item_id", ""), "quantity": 1}, token=tok_c)
if line.get("item_id") and r.get("error", {}).get("code") == "not_enough_items":
    check("can't give what you don't have", True)
if sup:
    call("buy_listing", {"listing_id": sup[0]["id"], "quantity": 2}, token=tok_c)
    s, before = call("get_state", token=tok_c)
    s, r = call("duke_contribute", {"item_id": line["item_id"], "quantity": 2}, token=tok_c)
    given = r["data"]["given"] if r.get("ok") else {}
    check("give 2 to the Duke: paid at once, items gone", s == 200 and given["quantity"] == 2 and given["paid"] == int(2 * usual_line * 1.25)
          and r["data"]["state"]["player"]["gold"] == before["data"]["player"]["gold"] + given["paid"]
          and have(r["data"]["state"], line["item_id"]) == have(before["data"], line["item_id"]) - 2, r)
    b = r["data"]["board"] if r.get("ok") else {}
    check("the public board lists you as a helper", s == 200 and any(h["me"] and h["items"] >= 2 for h in b["helpers"]), b.get("helpers"))
    check("the line counts your goods", s == 200 and b["lines"][0]["delivered"] >= 2 and b["lines"][0]["mine"] >= 2, b.get("lines"))
    check("the gift shows in activity", s == 200 and r["data"]["state"]["activity"][0]["type"] == "duke_contributed", r)
s, r = call("duke_contribute", {"item_id": "copper_ore", "quantity": 1}, token=tok_c)
check("the Duke doesn't want raw ore", s == 400, r)
with ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(lambda _: call("duke_order", token=tok_b), range(4)))
check("4 board loads at once: one order, no errors", all(st == 200 for st, _ in results)
      and len({x["data"]["id"] for _, x in results}) == 1, [st for st, _ in results])

# ---------------------------------------------------------------- the Palazzo (0.11.0, docs/palazzo.md)
s, r = call("presence_token", token=tok_d)
check("the presence pass opens the Palazzo room too", s == 200 and (r["data"].get("enabled") is False or "palazzo" in json.loads(
    __import__("base64").urlsafe_b64decode(r["data"]["token"].split(".")[0] + "==").decode())["q"]), r)

name_w, _, tok_w, _ = register("w")
call("choose_profession", {"profession_id": "leatherworker"}, token=tok_w)
name_x, _, tok_x, _ = register("x")
call("choose_profession", {"profession_id": "blacksmith"}, token=tok_x)

s, r = call("wanted", token=tok_w)
band = r["data"]["bands"]["brass_fittings"] if s == 200 else {}
check("the Wanted board lists a fair price band for every item", s == 200 and band["min"] < band["usual"] < band["max"]
      and len(r["data"]["bands"]) == len(json.loads((CONTENT / "items.json").read_text(encoding="utf-8"))["items"]), r)
s, r = call("wanted_post", {"item_id": "brass_fittings", "quantity": 4, "unit_price": band.get("max", 0) + 1}, token=tok_w)
check("a price above the band is refused", s == 400 and r["error"]["code"] == "price_out_of_band", r)
s, r = call("wanted_post", {"item_id": "brass_fittings", "quantity": 4, "unit_price": max(1, band.get("min", 1) - 1)}, token=tok_w)
check("a price below the band is refused", s == 400 and r["error"]["code"] == "price_out_of_band", r)
s, before = call("get_state", token=tok_w)
price = band.get("usual", 10)
s, r = call("wanted_post", {"item_id": "brass_fittings", "quantity": 4, "unit_price": price}, token=tok_w)
post_id = r["data"]["posted"]["id"] if s == 200 else 0
check("post 'Wanted: 4 Brass Fittings': the ducats are held", s == 200 and r["data"]["state"]["player"]["gold"] == before["data"]["player"]["gold"] - 4 * price
      and r["data"]["board"]["mine"][0]["remaining"] == 4, r)
s, r = call("wanted", token=tok_x)
mine_view = next((p for p in r["data"]["posts"] if p["id"] == post_id), None) if s == 200 else None
check("another crafter sees it on the board", mine_view is not None and mine_view["player"] == name_w and mine_view["mine"] is False, r)
s, r = call("wanted_fill", {"post_id": post_id, "quantity": 1}, token=tok_w)
check("you can't fill your own request", s == 400 and r["error"]["code"] == "own_post", r)
s, r = call("wanted_fill", {"post_id": post_id, "quantity": 1}, token=tok_x)
check("filling without the goods is refused", s == 400 and r["error"]["code"] == "not_enough_items", r)
if PLAYER_TOOL:
    tool("give", name_x, "brass_fittings", 10)
    s, xb = call("get_state", token=tok_x)
    s, r = call("wanted_fill", {"post_id": post_id, "quantity": 3}, token=tok_x)
    f = r["data"]["filled"] if s == 200 else {}
    cut = -(-3 * price * 5 // 100)   # the Mercato cut (5%), rounded up
    check("fill 3 of 4: paid now, minus the Mercato cut", s == 200 and f["quantity"] == 3 and f["earned"] == 3 * price - cut
          and r["data"]["state"]["player"]["gold"] == xb["data"]["player"]["gold"] + 3 * price - cut
          and have(r["data"]["state"], "brass_fittings") == 7, r)
    s, r = call("get_state", token=tok_w)
    check("the poster receives the goods", have(r["data"], "brass_fittings") == 3
          and any(a["type"] == "wanted_received" for a in r["data"]["activity"]), r["data"]["activity"][:3])
    s, r = call("wanted_fill", {"post_id": post_id, "quantity": 5}, token=tok_x)
    check("filling more than is left takes only what's left, and closes it", s == 200 and r["data"]["filled"]["quantity"] == 1
          and r["data"]["filled"]["done"] is True, r)
    s, r = call("wanted_fill", {"post_id": post_id, "quantity": 1}, token=tok_x)
    check("a filled request is closed", s == 409 and r["error"]["code"] == "post_closed", r)

    # cancel and expiry give back what's still held
    s, before = call("get_state", token=tok_w)
    s, r = call("wanted", token=tok_w)
    lp = r["data"]["bands"]["copper_lantern"]["usual"]
    s, r = call("wanted_post", {"item_id": "copper_lantern", "quantity": 2, "unit_price": lp}, token=tok_w)
    lid = r["data"]["posted"]["id"] if s == 200 else 0
    s, r = call("wanted_cancel", {"post_id": lid}, token=tok_x)
    check("you can't cancel someone else's request", s == 403, r)
    s, r = call("wanted_cancel", {"post_id": lid}, token=tok_w)
    check("cancel: the held ducats come back", s == 200 and r["data"]["cancelled"]["refund"] == 2 * lp
          and r["data"]["state"]["player"]["gold"] == before["data"]["player"]["gold"], r)
    s, r = call("wanted", token=tok_w)
    gp = r["data"]["bands"]["leather_grip"]["usual"]
    s, before = call("get_state", token=tok_w)
    codes = [call("wanted_post", {"item_id": "leather_grip", "quantity": 1, "unit_price": gp}, token=tok_w)[0] for _ in range(4)]
    check("at most 3 requests on the board", codes == [200, 200, 200, 409], codes)
    tool("expire_wanted", name_w)
    if TICK:
        subprocess.run(TICK, shell=True, check=True, capture_output=True)
        s, r = call("get_state", token=tok_w)
        check("expired requests are refunded by the market tick", r["data"]["player"]["gold"] == before["data"]["player"]["gold"]
              and any(a["type"] == "wanted_expired" for a in r["data"]["activity"]), r["data"]["activity"][:4])

    # two crafters filling the last unit at the same moment: only one gets it
    s, r = call("wanted_post", {"item_id": "brass_fittings", "quantity": 1, "unit_price": price}, token=tok_w)
    race_id = r["data"]["posted"]["id"] if s == 200 else 0
    name_y, _, tok_y, _ = register("y")
    call("choose_profession", {"profession_id": "blacksmith"}, token=tok_y)
    tool("give", name_y, "brass_fittings", 2)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda t: call("wanted_fill", {"post_id": race_id, "quantity": 1}, token=t), [tok_x, tok_y]))
    check("two fills at once: exactly one succeeds", sorted(st for st, _ in results) == [200, 409], [x for _, x in results])

# Hall of honor
s, r = call("honors", token=tok_w)
boards = {b["id"]: b for b in r["data"]["boards"]} if s == 200 else {}
check("the Hall of honor: Il Factotum and four boards", s == 200 and r["data"]["factotum"] and set(boards) == {"gold", "skill", "duke", "bottegas"}
      and r["data"]["title"].startswith("Il Factotum"), r)
f = r["data"]["factotum"] or {}
check("the Factotum comes with their merchant's look, for the statue and the portrait (0.13.0)", f.get("look") and f["look"]["profession_id"]
      and isinstance(f["look"]["color"], int) and isinstance(f["look"]["hat"], int) and isinstance(f["look"]["rank"], int), f)
check("the finest bottegas list the Bellows forge", any(row["name"] == name_d and "Bellows" in row["value"] for row in boards.get("bottegas", {}).get("rows", [])) or not PLAYER_TOOL, boards.get("bottegas"))

# the three officials: rumors from real data, one favor a day each
s, r = call("palazzo", token=tok_x)
check("the Palazzo has three officials", s == 200 and [n["id"] for n in r["data"]["npcs"]] == ["notary", "crier", "steward"], r)
for npc in ("notary", "crier", "steward"):
    s, r = call("npc_talk", {"npc": npc}, token=tok_x)
    check(f"{npc}: a line, a rumor and today's favor", s == 200 and r["data"]["line"] and r["data"]["rumor"] and r["data"]["favor"]
          and r["data"]["favor"]["quantity"] > 0 and r["data"]["favor"]["done"] is False, r)
s, r = call("npc_talk", {"npc": "steward"}, token=tok_x)
fav = r["data"]["favor"]
check("the steward asks for another guild's goods (pillar 5)", json.loads((CONTENT / "items.json").read_text(encoding="utf-8"))
      and next(i for i in json.loads((CONTENT / "items.json").read_text(encoding="utf-8"))["items"] if i["id"] == fav["item_id"])["profession"] != "blacksmith", fav)
check("a favor pays under the Guild Suppliers' price (1.5x usual)", fav["reward"] < 1.5 * fav["quantity"] * next(
    i for i in json.loads((CONTENT / "items.json").read_text(encoding="utf-8"))["items"] if i["id"] == fav["item_id"])["reference_value"], fav)
s, r2 = call("npc_talk", {"npc": "steward"}, token=tok_x)
check("the same favor all day", r2["data"]["favor"]["item_id"] == fav["item_id"] and r2["data"]["favor"]["quantity"] == fav["quantity"], (fav, r2["data"]["favor"]))
s, r = call("npc_talk", {"npc": "doge"}, token=tok_x)
check("an unknown official is refused", s == 400, r)
s, r = call("npc_favor", {"npc": "steward"}, token=tok_x)
check("a favor without the goods is refused", s == 400 and r["error"]["code"] == "not_enough_items", r)
if PLAYER_TOOL:
    tool("give", name_x, fav["item_id"], fav["quantity"])
    s, before = call("get_state", token=tok_x)
    s, r = call("npc_favor", {"npc": "steward"}, token=tok_x)
    check("do the steward's favor: goods given, ducats paid", s == 200 and r["data"]["state"]["player"]["gold"] == before["data"]["player"]["gold"] + fav["reward"]
          and r["data"]["talk"]["favor"]["done"] is True and have(r["data"]["state"], fav["item_id"]) == have(before["data"], fav["item_id"]) - fav["quantity"], r)
    s, r = call("npc_favor", {"npc": "steward"}, token=tok_x)
    check("one favor per official per day", s == 409 and r["error"]["code"] == "favor_done", r)

    # A rank kept from before 0.11.0: a Journeyman in the shack is capped at 50, not 25.
    tool("kept_rank", name_x, 1)
    tool("skill", name_x, 30)
    s, r = call("get_state", token=tok_x)
    pg = r["data"]["profession"]["progress"]
    check("a kept Journeyman rank: cap 50 in the shack", pg["cap"] == 50 and pg["at_cap"] is False
          and r["data"]["profession"]["workshop"]["kept_rank"] is True and r["data"]["profession"]["workshop"]["level"] == 1, r["data"]["profession"]["workshop"])

# ---------------------------------------------------------------- the new-player guide (0.14.0)
GUIDE = json.loads((CONTENT / "guide.json").read_text(encoding="utf-8"))
name_g, _, tok_g, _ = register("g")
s, r = call("get_state", token=tok_g)
check("no guide before joining a guild", s == 200 and r["data"]["guide"] == {"finished": True}, r["data"].get("guide"))
s, r = call("choose_profession", {"profession_id": "blacksmith"}, token=tok_g)
g = r["data"].get("guide", {})
check("a new crafter starts the guide at its first step, not yet done", g.get("finished") is False and g["index"] == 1
      and g["total"] == len(GUIDE["steps"]) and g["step"]["id"] == GUIDE["steps"][0]["id"] and g["step"]["ready"] is False, g)
s, r = call("guide_claim", {"step": "collect"}, token=tok_g)
check("can't claim a step before doing it", s == 400 and r["error"]["code"] == "guide_not_done", r)
s, r = call("guide_claim", {"step": "craft"}, token=tok_g)
check("can't claim a later step", s == 409 and r["error"]["code"] == "guide_wrong_step", r)
s, r = call("guide_skip", {"step": "collect"}, token=tok_g)
check("can't skip a step that isn't optional", s == 400 and r["error"]["code"] == "guide_not_optional", r)
call("collect_station", {}, token=tok_g)
s, r = call("get_state", token=tok_g)
gold0 = r["data"]["player"]["gold"]
check("collecting makes the first step ready", r["data"]["guide"]["step"]["ready"] is True, r["data"]["guide"])
s, r = call("guide_claim", {"step": "collect"}, token=tok_g)
reward = GUIDE["steps"][0]["reward"]
check("claiming pays the step's ducats and moves on", s == 200 and r["data"]["gold"] == reward and r["data"]["guide"]["step"]["id"] == "craft", r)
s, r = call("get_state", token=tok_g)
check("the ducats are in your purse", r["data"]["player"]["gold"] == gold0 + reward, r["data"]["player"])
s, r = call("guide_claim", {"step": "collect"}, token=tok_g)
check("a step can't be claimed twice", s == 409, r)
call("start_craft", {"recipe_id": "brass_fittings", "quantity": 1}, token=tok_g)
wait_for_crafts(tok_g)
call("collect_crafts", {}, token=tok_g)
s, r = call("guide_claim", {"step": "craft"}, token=tok_g)
check("crafting something completes the craft step", s == 200 and r["data"]["guide"]["step"]["id"] == "train", r)
if PLAYER_TOOL:
    tool("skill", name_g, 6)
    s, r = call("guide_claim", {"step": "train"}, token=tok_g)
    check("skill 6 completes the train step", s == 200 and r["data"]["guide"]["step"]["id"] == "learn", r)
    call("learn_recipe", {"recipe_id": "copper_lantern"}, token=tok_g)
    s, r = call("guide_claim", {"step": "learn"}, token=tok_g)
    check("learning a recipe at the trainer completes the learn step", s == 200 and r["data"]["guide"]["step"]["id"] == "palazzo", r)
    s, r = call("guide_mark", {"what": "nowhere"}, token=tok_g)
    check("only the Palazzo and a slap can be reported", s == 400, r)
    s, r = call("guide_mark", {"what": "palazzo"}, token=tok_g)
    check("reaching the Palazzo (reported by the client) makes that step ready", s == 200 and r["data"]["step"]["ready"] is True, r)
    call("guide_claim", {"step": "palazzo"}, token=tok_g)
    s, r = call("get_state", token=tok_g)
    before = r["data"]["player"]["gold"]
    s, r = call("guide_skip", {"step": "slap"}, token=tok_g)
    check("skipping the optional slap finishes the guide and pays the final purse", s == 200 and r["data"]["finished"] is True
          and r["data"]["gold"] == 0 and r["data"]["final"] == GUIDE["final_reward"], r)
    s, r = call("get_state", token=tok_g)
    check("the purse arrived and the guide is gone", r["data"]["player"]["gold"] == before + GUIDE["final_reward"]
          and r["data"]["guide"] == {"finished": True}, r["data"].get("guide"))
    s, r = call("guide_claim", {"step": "slap"}, token=tok_g)
    check("a finished guide pays nothing more", s == 409 and r["error"]["code"] == "guide_finished", r)

# ---------------------------------------------------------------- minigames (0.15.0, content/minigames.json)
MG = json.loads((CONTENT / "minigames.json").read_text(encoding="utf-8"))


def strike_pos(sw, ms):
    x = (sw["phase"] + sw["speed"] * ms / 1000) % 2
    return x if x <= 1 else 2 - x


def strike_taps(plan, aim="perfect"):
    """One tap per swing: the first moment the marker is dead centre (perfect), or as far from it as possible (miss)."""
    taps = []
    for sw in plan["swings"]:
        span = range(plan["min_tap_ms"], plan["swing_timeout_ms"] + 1)
        if aim == "perfect":
            taps.append(next(ms for ms in span if abs(strike_pos(sw, ms) - sw["center"]) <= 0.01))
        else:
            taps.append(max(span, key=lambda ms: abs(strike_pos(sw, ms) - sw["center"])))
    return taps


def strike_min_s(plan, taps):
    return (sum(t if t is not None else plan["swing_timeout_ms"] for t in taps) + plan["gap_ms"] * (len(taps) - 1)) / 1000


name_m, _, tok_m, _ = register("m")
s, r = call("choose_profession", {"profession_id": "blacksmith"}, token=tok_m)
game = r["data"]["profession"]["station"].get("minigame") or {}
check("a station has its game: kind, look, words, freshness", game.get("kind") == "strike" and game.get("skin") == "pickaxe"
      and game.get("words", {}).get("title") and game.get("freshness") == 1 and game.get("item_id") == "copper_ore" and game.get("max_units", 0) > 0, game)
s, r = call("minigame_start", {"target": "nowhere"}, token=tok_m)
check("only known targets can be played", s == 400, r)
s, r = call("minigame_start", {"target": "station"}, token=tok_m)
rnd = r["data"] if r.get("ok") else {}
plan = rnd.get("plan", {})
check("starting a round rolls a plan (one swing each, sweet spot on the bar)", s == 200 and len(plan.get("swings", [])) == MG["kinds"]["strike"]["params"]["swings"]
      and all(0 < sw["center"] < 1 and sw["speed"] > 0 for sw in plan["swings"]), r)
taps = strike_taps(plan)
s, r = call("minigame_finish", {"round_id": rnd.get("round_id"), "taps": taps[:-1]}, token=tok_m)
check("one tap per swing is required", s == 400 and r["error"]["code"] == "bad_request", r)
s, r = call("minigame_finish", {"round_id": rnd.get("round_id"), "taps": [5] * len(taps)}, token=tok_m)
check("taps before the swing can start are refused", s == 400, r)
s, r = call("minigame_finish", {"round_id": rnd.get("round_id"), "taps": taps}, token=tok_m)
check("a round sent back faster than it can be played is refused", s == 400 and r["error"]["code"] == "too_fast", r)
time.sleep(strike_min_s(plan, taps))
s, r = call("get_state", token=tok_m)
copper0 = have(r["data"], "copper_ore")
s, r = call("minigame_finish", {"round_id": rnd.get("round_id"), "taps": taps}, token=tok_m)
res = r["data"] if r.get("ok") else {}
paid = {x["item_id"]: x["quantity"] for x in res.get("rewards", []) if not x.get("find")}
finds = [x for x in res.get("rewards", []) if x.get("find")]
check("a perfect fresh round scores 100% and pays the full amount shown", s == 200 and res["score"] == 1 and res["steps"] == ["perfect"] * len(taps)
      and paid.get("copper_ore") == game["max_units"], r)
check("a great round also finds raws, labelled with the station's find text", len(finds) == 1 and finds[0]["quantity"] == MG["targets"]["station"]["find_units"]
      and finds[0]["text"] == GUILDS[0]["station"]["find_label"], finds)
check("the raws are in the storehouse", have(res.get("state", {}), "copper_ore") == copper0 + game["max_units"] + finds[0]["quantity"] if finds else False, res.get("state", {}).get("inventory"))
check("the round is in the activity log", any(a["type"] == "worked" and "Copper Ore" in a["text"] for a in res.get("state", {}).get("activity", [])), res.get("state", {}).get("activity", [])[:3])
s, r = call("minigame_finish", {"round_id": rnd.get("round_id"), "taps": taps}, token=tok_m)
check("a round pays only once", s == 400 and r["error"]["code"] == "round_closed", r)
fresh2 = res.get("state", {}).get("profession", {}).get("station", {}).get("minigame", {})
drop = MG["tiredness"]["drop_per_round"]
check("after a round you're a little tired: the next pays less", abs(fresh2.get("freshness", 0) - (1 - drop)) < 0.01 and fresh2.get("max_units", 99) < game["max_units"], fresh2)

s, r = call("minigame_start", {"target": "station"}, token=tok_m)
old = r["data"]["round_id"]
s, r = call("minigame_start", {"target": "station"}, token=tok_m)
rnd2 = r["data"]
s, r = call("minigame_finish", {"round_id": old, "taps": strike_taps(plan)}, token=tok_m)
check("starting a new round closes the one still open", s == 400 and r["error"]["code"] == "round_closed", r)
taps2 = strike_taps(rnd2["plan"], aim="miss")
time.sleep(strike_min_s(rnd2["plan"], taps2))
s, r = call("minigame_finish", {"round_id": rnd2["round_id"], "taps": taps2}, token=tok_m)
check("missing every swing scores 0 and pays nothing", s == 200 and r["data"]["score"] == 0 and r["data"]["rewards"] == [], r)
s, r = call("minigame_finish", {"round_id": rnd2["round_id"], "taps": taps2}, token=tok_a)
check("another player can't finish your round", s == 400 and r["error"]["code"] == "round_closed", r)

s, r = call("logout", {}, token=tok_a)
s, r = call("get_state", token=tok_a)
check("logged out", s == 401, r)

print()
print("ALL PASSED" if failures == 0 else f"{failures} FAILED")
sys.exit(1 if failures else 0)
