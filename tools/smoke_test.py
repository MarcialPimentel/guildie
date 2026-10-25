#!/usr/bin/env python3
"""
Guildie API smoke test. Exercises every M0 action end to end.

    python3 tools/smoke_test.py http://127.0.0.1:8080/games/guildie/api/index.php
    python3 tools/smoke_test.py https://marz.gg/games/guildie/api/index.php

Creates a throwaway player named smoke_<random>. Exits non-zero if anything fails.
"""
import json
import random
import string
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080/games/guildie/api/index.php"
failures = 0


def call(action, body=None, token=None, method=None):
    method = method or ("POST" if body is not None else "GET")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}?action={action}", data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-Guildie-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def check(label, condition, detail=""):
    global failures
    print(("PASS  " if condition else "FAIL  ") + label + ("" if condition else f"  -> {detail}"))
    if not condition:
        failures += 1


name = "smoke_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
password = "pw-" + "".join(random.choices(string.ascii_letters, k=10))

s, r = call("ping")
check("ping returns ok + build", s == 200 and r["ok"] and "build" in r["data"], r)

s, r = call("nope")
check("unknown action -> 404", s == 404 and r["error"]["code"] == "unknown_action", r)

s, r = call("register", method="GET")
check("wrong method -> 405", s == 405, r)

s, r = call("get_state")
check("get_state without login -> 401", s == 401 and r["error"]["code"] == "not_logged_in", r)

s, r = call("register", {"name": "a", "password": password})
check("short name rejected", s == 400 and r["error"]["code"] == "invalid_name", r)

s, r = call("register", {"name": name, "password": "123"})
check("short password rejected", s == 400 and r["error"]["code"] == "invalid_password", r)

s, r = call("register", {"name": name, "password": password})
check("register succeeds", s == 200 and r["ok"] and r["data"]["token"], r)
token = r["data"]["token"] if r.get("ok") else None
state = r["data"]["state"] if r.get("ok") else {}
check("new player has starting gold", state.get("player", {}).get("gold", 0) > 0, state)
check("new player has starting items", len(state.get("inventory", [])) > 0, state)

s, r = call("register", {"name": name.upper(), "password": password})
check("duplicate name (any case) -> 409", s == 409 and r["error"]["code"] == "name_taken", r)

s, r = call("login", {"name": name, "password": "wrong-password"})
check("wrong password -> 401", s == 401 and r["error"]["code"] == "invalid_credentials", r)

s, r = call("login", {"name": name, "password": password})
check("login succeeds", s == 200 and r["ok"] and r["data"]["token"], r)
token2 = r["data"]["token"] if r.get("ok") else None

s, r = call("get_state", token=token2)
check("get_state with token", s == 200 and r["data"]["player"]["name"] == name, r)
before = sum(i["quantity"] for i in r["data"]["inventory"] if i["item_id"] == "copper_ore") if r.get("ok") else 0

s, r = call("test_add_item", {"item_id": "copper_ore", "quantity": 3}, token=token2)
after = sum(i["quantity"] for i in r["data"]["inventory"] if i["item_id"] == "copper_ore") if r.get("ok") else -1
check("test_add_item adds 3 ore", s == 200 and after == before + 3, r)

s, r = call("test_add_item", {"item_id": "dragon_scale", "quantity": 1}, token=token2)
check("unknown item rejected", s == 400 and r["error"]["code"] == "unknown_item", r)

s, r = call("test_add_item", {"item_id": "copper_ore", "quantity": 999}, token=token2)
check("quantity over limit rejected", s == 400, r)

s, r = call("get_state", token=token2)
persisted = sum(i["quantity"] for i in r["data"]["inventory"] if i["item_id"] == "copper_ore") if r.get("ok") else -1
check("inventory change persisted", persisted == after, r)

s, r = call("logout", {}, token=token2)
check("logout succeeds", s == 200, r)

s, r = call("get_state", token=token2)
check("token rejected after logout", s == 401, r)

s, r = call("get_state", token=token)
check("other session still valid", s == 200, r)

s, r = call("get_state", token="not-a-real-token")
check("fake token rejected", s == 401, r)

print()
print("ALL PASSED" if failures == 0 else f"{failures} FAILED")
sys.exit(1 if failures else 0)
