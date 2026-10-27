## Headless client test: runs the real game screens against an API and plays through the M1 loop.
##   GUILDIE_API_URL=http://127.0.0.1:8080/games/guildie/api/index.php \
##     godot --headless --path client -s tests/client_smoke.gd
## For speed, run the server with a content copy whose pace.time_multiplier is small (e.g. 0.05).
extends SceneTree

var failures := 0
var main: Node


func check(label: String, ok: bool, detail: Variant = "") -> void:
	print(("PASS  " if ok else "FAIL  ") + label + ("" if ok else "  -> " + str(detail).left(300)))
	if not ok:
		failures += 1


func _initialize() -> void:
	_run.call_deferred()


func frames(n := 3) -> void:
	for i in n:
		await process_frame


func screen_script() -> Script:
	return main._current.get_script()


func _run() -> void:
	var session = root.get_node("Session")
	var api = root.get_node("Api")
	session.token = ""
	check("API URL resolved", api.base_url != "", api.base_url)

	main = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)
	await frames()
	check("starts on login screen", screen_script() == main.LoginScreen)

	# --- register -> profession screen
	var player_name := "gd_%d" % (int(Time.get_unix_time_from_system()) % 1000000)
	var r: Dictionary = await session.register(player_name, "testpass")
	check("register", r["ok"], r)
	await frames()
	check("new player goes to profession screen", screen_script() == main.ProfessionScreen)
	await create_timer(1.5).timeout
	check("profession cards loaded", main._current._buttons.size() == 3, main._current._buttons.size())

	# --- choose via the real button
	main._current._buttons[1].pressed.emit()   # Alchemist (second card)
	await create_timer(1.5).timeout
	await frames()
	check("joined a guild -> game screen", screen_script() == main.GameScreen)
	check("profession is alchemist", session.state["profession"]["id"] == "alchemist", session.state.get("profession"))
	var game = main._current
	check("header shows gold", game._gold.text.ends_with("g"), game._gold.text)

	# --- workshop: collect
	r = await session.collect_station()
	check("collect station", r["ok"], r)
	await frames()
	check("workshop shows activity", game._tabs[0]._activity_box.get_child_count() > 0)

	# --- recipes live in the Workshop now (#39)
	check("only 4 tabs: Workshop, Market, Bag, City", game._tabs.size() == 4, game._tabs.size())
	var recipes = game._tabs[0]._col.get_node_or_null("Recipes")
	check("workshop shows the recipes (header + 4 recipes + note)", recipes != null and recipes.get_child_count() >= 6, recipes.get_child_count() if recipes else -1)
	check("recipes have a Craft button", recipes != null and recipes.find_children("*", "Button", true, false).any(func(b): return b.text == "Craft" or b.text == "Missing materials"))
	r = await session.start_craft("healing_draught", 2)
	check("start craft", r["ok"], r)
	await frames()
	game.show_tab(0)
	await frames()
	check("workshop shows the craft", game._tabs[0]._crafts_box.get_node_or_null("CollectCrafts") != null)
	await create_timer(4.0).timeout
	r = await session.collect_crafts()
	check("collect crafts", r["ok"], r)

	# --- bag
	game.show_tab(2)
	await frames()
	check("bag lists items", game._tabs[2]._col.get_child_count() >= 2)

	# --- market browse, item, sell, mine
	game.show_tab(1)
	await create_timer(1.5).timeout
	var market = game._tabs[1]
	check("market browse loaded", market._view == "browse" and market._body.get_child_count() > 3, market._body.get_child_count())
	market._show_item("healing_draught")
	await create_timer(1.5).timeout
	check("item detail loaded", market._view == "item" and market._item_title == "Healing Draught", market._item_title)

	game.open_market("sell")
	await frames()
	check("sell list shown", market._view == "sell")
	market._show_sell_form("healing_draught", 2)   # crafted 2 draughts above
	await create_timer(1.5).timeout
	check("sell form loaded with a quote", market._view == "sell_form" and not market._quote.is_empty(), market._quote)
	check("sell form offers a guild sale", market._body.find_child("SellToGuild", true, false) != null)
	var guild: Dictionary = market._quote.get("guild", {})
	r = await session.sell_to_guild("healing_draught", 1, int(guild.get("first_unit", 0)))
	check("sell 1 to the guild", r["ok"] and int(r["data"]["sale"]["total"]) == int(guild.get("first_unit", -1)), r)
	r = await session.list_item("healing_draught", 1, 15, 12)
	check("list item", r["ok"], r)
	market.set_mode("mine")
	await create_timer(1.5).timeout
	check("my listings shows it", market._view == "mine" and market._body.get_child_count() >= 2)

	# --- buy from the guild suppliers (needs one tick to have happened)
	r = await session.market_item("brass_fittings")
	var npc: Array = r["data"]["listings"].filter(func(l): return l["is_npc"]) if r["ok"] else []
	if npc.is_empty():
		print("SKIP  buy from suppliers (no tick has run yet)")
	else:
		r = await session.buy_listing(int(npc[0]["id"]), 1)
		check("buy brass fittings from suppliers", r["ok"], r)

	# --- City tab (#31, #32): directory, a profile, the trade form, the trades inbox
	game.show_tab(3)
	await create_timer(1.5).timeout
	var city = game._tabs[3]
	check("city: player list loaded", city._view == "players" and city._body.get_child_count() >= 3, city._body.get_child_count())
	check("city: one list with Gold and Crafts sort headings (#38)", city._body.find_child("SortGold", true, false) != null and city._body.find_child("SortCrafts", true, false) != null)
	city._body.find_child("SortCrafts", true, false).pressed.emit()
	await create_timer(1.5).timeout
	check("city: tapping Crafts sorts by crafts", city._sort == "mastery" and city._view == "players")
	r = await session.players("wealth")
	var others: Array = r["data"]["players"].filter(func(p): return not p["me"]) if r["ok"] else []
	check("city: directory lists me", r["ok"] and r["data"]["me"] != null, r)
	if others.is_empty():
		print("SKIP  city profile and trade form (no other players)")
	else:
		city._show_profile(int(others[0]["id"]))
		await create_timer(1.5).timeout
		check("city: profile loaded with a Propose trade button", city._view == "profile" and city._body.find_child("ProposeTrade", true, false) != null)
		city._body.find_child("ProposeTrade", true, false).pressed.emit()
		await create_timer(1.5).timeout
		check("city: trade form shows", city._view == "compose" and city._body.find_child("SendOffer", true, false) != null)
	city.set_mode("trades")
	await create_timer(1.5).timeout
	check("city: trades inbox loaded", city._view == "trades" and city._body.get_child_count() >= 2)

	# --- feedback pop-up (#29), through the real buttons
	game.find_child("FeedbackButton", true, false).pressed.emit()
	await frames()
	var popup: Node = game.find_child("FeedbackPopup", true, false)
	check("feedback pop-up opens", popup != null)
	if popup:
		popup.find_child("FeedbackText", true, false).text = "Client smoke test feedback"
		popup.find_child("SendFeedback", true, false).pressed.emit()
		await create_timer(1.5).timeout
		await frames()
		check("feedback sent and pop-up closed", game.find_child("FeedbackPopup", true, false) == null, game._message.text)

	# --- logout
	await session.logout()
	await frames()
	check("logout returns to login", screen_script() == main.LoginScreen)

	print("\n" + ("ALL PASSED" if failures == 0 else "%d FAILED" % failures))
	quit(1 if failures else 0)
