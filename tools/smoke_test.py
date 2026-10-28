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
check("profession list has 3", s == 200 and len(r["data"]["professions"]) == 3, r)
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
      and state["profession"]["station"]["locked"] == [{"item_id": "ember_moss", "name": "Ember Moss", "unlock_skill": 15}], state["profession"]["station"])
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
      and r["data"]["recipes_total"] == 4 and r["data"]["can_trade"], r)
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
check("Apprentice: no bundle orders", all(o["kind"] in ("standard", "collector") for o in orders), [o["kind"] for o in orders])
check("standard orders pay more than market value", all(o["reward_gold"] > 0 for o in orders), orders)
check("orders pay XP (#30)", all(o["reward_xp"] > 0 for o in orders), [o.get("reward_xp") for o in orders])
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
for rid, why in (("copper_lantern", "trainer"), ("iron_sword", "trainer"), ("arsenale_fittings", "rare")):
    s, r = call("start_craft", {"recipe_id": rid, "quantity": 1}, token=tok_d)
    check(f"can't craft unknown {rid}", s == 400 and r["error"]["code"] == "recipe_not_known" and why in r["error"]["message"], r)

s, r = call("trainer", token=tok_d)
tr = {x["id"]: x for x in r["data"]["recipes"]} if s == 200 else {}
check("trainer lists all 6 blacksmith recipes", s == 200 and len(tr) == 6 and r["data"]["trainer"], r)
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

if PLAYER_TOOL:
    # Rank-up (#30): one XP short of 26, then a green lantern (2 XP) makes a Journeyman.
    subprocess.run(f"{PLAYER_TOOL} skill {name_d} 25", shell=True, check=True, capture_output=True)
    s, r = craft_and_collect(tok_d, "copper_lantern", 1)
    pr = r["data"].get("progress", {}) if s == 200 else {}
    check("rank-up: Journeyman at 26", pr.get("skill_to") == 26 and pr.get("rank_up") == "Journeyman", r)
    check("rank-up teaches the Journeyman starter free (Iron Ingot)", pr.get("learned") == ["Iron Ingot"]
          and any(x["id"] == "iron_ingot" for x in r["data"]["state"]["profession"]["recipes"]), pr)
    check("passing skill 15 opens iron ore at the mine", pr.get("unlocked") == ["Iron Ore"]
          and not r["data"]["state"]["profession"]["station"]["locked"], r["data"]["state"]["profession"]["station"])
    check("rank-up in activity", any(a["type"] == "rank_up" and "Journeyman Blacksmith" in a["text"] for a in r["data"]["state"]["activity"]), r["data"]["state"]["activity"][:5])
    st = r["data"]["state"]["profession"]["progress"]
    check("header data: Blacksmith 26/100 · Journeyman, Expert next at 51", st["skill"] == 26 and st["rank"] == "Journeyman"
          and st["next_rank"] == {"name": "Expert", "at": 51}, st)

    # Players from before 0.8.0 (#30): skill replayed from past crafts, every guild recipe kept, both raws kept.
    subprocess.run(f"{PLAYER_TOOL} legacy {name_d}", shell=True, check=True, capture_output=True)
    s, r = call("get_state", token=tok_d)
    st = r["data"]["profession"]
    check("legacy player: skill counted from past crafts", st["progress"]["skill"] == 6, st["progress"])
    check("legacy player keeps every guild recipe (not the rare ones)", sorted(x["id"] for x in st["recipes"])
          == ["brass_fittings", "copper_lantern", "iron_ingot", "iron_sword"], st["recipes"])
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

s, r = call("logout", {}, token=tok_a)
s, r = call("get_state", token=tok_a)
check("logged out", s == 401, r)

print()
print("ALL PASSED" if failures == 0 else f"{failures} FAILED")
sys.exit(1 if failures else 0)
