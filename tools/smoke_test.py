#!/usr/bin/env python3
"""
Guildie API smoke test (M1). Exercises accounts, professions, gathering, crafting, the Exchange,
and (optionally) the NPC market tick, end to end.

    python3 tools/smoke_test.py URL [--tick "COMMAND"]

    URL      e.g. http://127.0.0.1:8080/games/guildie/api/index.php
    --tick   a shell command that forces one market tick (local testing only), e.g.
             "php server/app/tick.php --force". Without it, market checks are skipped.

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

args = sys.argv[1:]
BASE = args[0] if args and not args[0].startswith("--") else "http://127.0.0.1:8080/games/guildie/api/index.php"
TICK = args[args.index("--tick") + 1] if "--tick" in args else None
failures = 0


def call(action, body=None, token=None, method=None, query=""):
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
check("alchemist sees 4 recipes", len(state["profession"]["recipes"]) == 4, state["profession"]["recipes"])
s, r = call("choose_profession", {"profession_id": "blacksmith"}, token=tok_a)
check("can't choose twice", s == 409, r)

# ---------------------------------------------------------------- gathering
s, r = call("collect_station", {}, token=tok_a)
check("collect station", s == 200 and len(r["data"]["collected"]) > 0, r)
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
check("missing inputs rejected", s == 400 and r["error"]["code"] == "not_enough_items", r)

batch = min(3, sunleaf // 2)
s, r = call("start_craft", {"recipe_id": "healing_draught", "quantity": batch}, token=tok_a)
check(f"start batch of {batch} healing draughts", s == 200 and len(r["data"]["crafts"]) == 1, r)
check("inputs removed at start", have(r["data"], "sunleaf") == sunleaf - 2 * batch, r["data"]["inventory"])
s, r = call("collect_crafts", {}, token=tok_a)
check("collect before done -> nothing_to_collect", s == 400 and r["error"]["code"] == "nothing_to_collect", r)

ember = have(r.get("data", {}).get("state", {}) or call("get_state", token=tok_a)[1]["data"], "ember_moss")
s, r = call("start_craft", {"recipe_id": "smelting_flux", "quantity": 1}, token=tok_a)
check("second slot used for smelting flux", s == 200 and len(r["data"]["crafts"]) == 2, r)
s, r = call("start_craft", {"recipe_id": "healing_draught", "quantity": 1}, token=tok_a)
check("third craft blocked: no free slot", s == 400 and r["error"]["code"] == "no_free_slot", r)

check("crafts finish", wait_for_crafts(tok_a), "timed out")
s, r = call("collect_crafts", {}, token=tok_a)
check("collect finished crafts", s == 200 and len(r["data"]["collected"]) == 2, r)
state = r["data"]["state"]
check("draughts in inventory", have(state, "healing_draught") == batch, state["inventory"])
check("slots free again", len(state["crafts"]) == 0, state["crafts"])
check("activity recorded", any(a["type"] == "crafted" for a in state["activity"]), state["activity"])

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
check("deposit charged", state.get("player", {}).get("gold") == gold_a - deposit, (gold_a, deposit, state.get("player")))

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

s, r = call("get_state", token=tok_a)
check("A got 14 minus 5% cut (13)", r["data"]["player"]["gold"] == gold_a - deposit + 13, r["data"]["player"])
check("A sees 'sold' activity naming B", any(a["type"] == "sold" and name_b in a["text"] for a in r["data"]["activity"]), r["data"]["activity"][:3])

s, r = call("my_listings", token=tok_a)
mine = [l for l in r["data"]["listings"] if l["id"] == listing_id]
check("my listings shows partial sale", mine and mine[0]["sold"] == 1 and mine[0]["status"] == "active", mine)

s, r = call("cancel_listing", {"listing_id": listing_id}, token=tok_b)
check("can't cancel someone else's listing", s == 404, r)
s, r = call("cancel_listing", {"listing_id": listing_id}, token=tok_a)
check("A cancels the rest", s == 200 and have(r["data"]["state"], "healing_draught") == batch - 1, r)
s, r = call("buy_listing", {"listing_id": listing_id, "quantity": 1}, token=tok_b)
check("cancelled listing can't be bought", s == 409, r)

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

    # B buys from the suppliers (always available)
    s, r = call("market_item", {"item_id": "smelting_flux"}, token=tok_b)
    sup = next(l for l in r["data"]["listings"] if l["is_npc"])
    s, r = call("buy_listing", {"listing_id": sup["id"], "quantity": 1}, token=tok_b)
    check("buy from guild suppliers", s == 200 and have(r["data"]["state"], "smelting_flux") == 1, r)
else:
    print("SKIP  market tick checks (no --tick command)")

s, r = call("logout", {}, token=tok_a)
s, r = call("get_state", token=tok_a)
check("logged out", s == 401, r)

print()
print("ALL PASSED" if failures == 0 else f"{failures} FAILED")
sys.exit(1 if failures else 0)
