## Headless client test: runs the real game scenes against an API and drives the login flow.
##   GUILDIE_API_URL=http://127.0.0.1:8080/games/guildie/api/index.php \
##     godot --headless --path client -s tests/client_smoke.gd
extends SceneTree

var failures := 0

func check(label: String, ok: bool, detail: Variant = "") -> void:
	print(("PASS  " if ok else "FAIL  ") + label + ("" if ok else "  -> " + str(detail)))
	if not ok:
		failures += 1

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var session = root.get_node("Session")
	var api = root.get_node("Api")
	session.token = ""
	check("API URL resolved", api.base_url != "", api.base_url)

	var main = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)
	await process_frame
	await process_frame
	check("starts on login screen", main._current != null and main._current.get_script() == main.LoginScreen)

	var player_name := "gd_%d" % (Time.get_unix_time_from_system() as int % 1000000)
	var r: Dictionary = await session.register(player_name, "testpass")
	check("register via client", r["ok"], r)
	await process_frame
	await process_frame
	check("switched to home screen", main._current.get_script() == main.HomeScreen)
	check("gold shown from server", main._current._gold.text.begins_with("Gold: "), main._current._gold.text)

	var before: int = _ore(session.state)
	r = await session.add_test_item()
	check("add test item", r["ok"] and _ore(session.state) == before + 1, r)

	r = await session.refresh()
	check("refresh keeps server value", r["ok"] and _ore(session.state) == before + 1, r)

	var saved_token: String = session.token
	await session.logout()
	await process_frame
	await process_frame
	check("logout returns to login", main._current.get_script() == main.LoginScreen)

	r = await session.login(player_name, "wrongpass")
	check("wrong password shows error", not r["ok"] and r["error"]["code"] == "invalid_credentials", r)
	r = await session.login(player_name, "testpass")
	check("login via client", r["ok"], r)

	session.token = saved_token  # revoked token
	r = await session.refresh()
	check("revoked token logs out locally", not r["ok"] and session.token == "", r)

	print("\n" + ("ALL PASSED" if failures == 0 else "%d FAILED" % failures))
	quit(1 if failures else 0)

func _ore(state: Dictionary) -> int:
	for item in state.get("inventory", []):
		if item["item_id"] == "copper_ore":
			return int(item["quantity"])
	return 0
