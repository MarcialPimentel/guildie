## City (#31, #32): every crafter in Brassmere, their profiles and shop windows, and direct trades.
## Views: players -> profile -> compose (a trade offer); trades (offers to you, your offers, recent).
extends Control

const MAX_ITEM_QTY := 999

var game: Node

var _mode_buttons := {}
var _body: VBoxContainer
var _view := "players"          # players | profile | compose | trades
var _sort := "wealth"
var _profile_id := 0
var _loading := false

# compose state
var _target: Dictionary = {}    # {id, name}
var _catalog: Array = []        # every item: {item_id, name, profession}
var _give := {}                 # item_id -> qty
var _ask := {}
var _give_gold := 0
var _ask_gold := 0
var _note: LineEdit
var _summary: Label


func _ready() -> void:
	var root := VBoxContainer.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 0)
	add_child(root)

	var mm := MarginContainer.new()
	for side in ["left", "right"]:
		mm.add_theme_constant_override("margin_" + side, UI.MARGIN)
	mm.add_theme_constant_override("margin_top", 10)
	root.add_child(mm)
	var modes := HBoxContainer.new()
	modes.add_theme_constant_override("separation", 6)
	mm.add_child(modes)
	for spec in [["players", "Players"], ["trades", "Trades"]]:
		var b := UI.button(spec[1], true, true)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(set_mode.bind(spec[0]))
		modes.add_child(b)
		_mode_buttons[spec[0]] = b

	_body = UI.scroll_column(root)


func on_shown() -> void:
	set_mode("trades" if _view == "trades" else "players")


func render() -> void:
	var n := int(Session.state.get("incoming_offers", 0))
	_mode_buttons["trades"].text = "Trades (%d)" % n if n > 0 else "Trades"


func on_background_refresh() -> void:
	if not visible or _loading:
		return
	match _view:
		"players": _show_players()
		"trades": _show_trades()


func set_mode(mode: String) -> void:
	for key in _mode_buttons:
		_mode_buttons[key].theme_type_variation = "TabOn" if key == mode else "SecondaryButton"
	render()
	match mode:
		"players": _show_players()
		"trades": _show_trades()


# ---------------------------------------------------------------- players

func _show_players() -> void:
	_view = "players"
	var data := await _fetch(Session.players.bind(_sort))
	if data.is_empty() or _view != "players":
		return
	UI.clear(_body)
	var me = data.get("me")
	if me != null:
		_body.add_child(UI.label("You are #%d of %d crafters by %s." % [me["rank"], data["total"], "gold" if _sort == "wealth" else "crafts made"], 16, UI.MUTED))
	_body.add_child(UI.label("Tap a crafter to see their shop window or propose a trade. Tap Gold or Crafts to sort.", 15, UI.MUTED))

	var box := UI.card(_body, 2)
	# One list (#38): Gold and Crafts are separate columns; tapping a heading sorts by it.
	var head := UI.row(box, 10)
	var spacer := UI.label("Crafter", 14, UI.MUTED)
	spacer.custom_minimum_size.x = 44
	head.add_child(UI.expand(spacer))
	for spec in [["wealth", "Gold"], ["mastery", "Crafts"]]:
		var h := UI.button(spec[1], true, true)
		h.name = "Sort" + spec[1]
		h.custom_minimum_size.x = 86 if spec[0] == "wealth" else 76
		h.add_theme_font_size_override("font_size", 15)
		h.theme_type_variation = "TabOn" if spec[0] == _sort else "SecondaryButton"
		h.pressed.connect(func():
			_sort = spec[0]
			_show_players())
		head.add_child(h)

	for p in data["players"]:
		var b := Button.new()
		b.flat = true
		b.custom_minimum_size.y = 56
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(_show_profile.bind(int(p["id"])))
		var r := HBoxContainer.new()
		r.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		r.add_theme_constant_override("separation", 10)
		r.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(r)
		var rank := UI.value("#%d" % p["rank"], 17, UI.MUTED)
		rank.custom_minimum_size.x = 44
		var who := VBoxContainer.new()
		who.add_theme_constant_override("separation", 0)
		var name_l := UI.label(str(p["name"]) + ("  (you)" if p["me"] else ""), 18, UI.BRASS if p["me"] else UI.CREAM)
		name_l.autowrap_mode = TextServer.AUTOWRAP_OFF
		who.add_child(name_l)
		if p.get("title") != null:
			who.add_child(UI.label(str(p["title"]), 14, UI.BRASS))
		who.add_child(UI.label("%s · %s" % [p["profession"], _seen(p["seen_ago"])], 14, UI.MUTED))
		var gold_l := UI.value(UI.gold(int(p["gold"])), 17, UI.CREAM if _sort == "wealth" else UI.MUTED)
		gold_l.custom_minimum_size.x = 86
		var crafts_l := UI.value(str(p["crafted"]), 17, UI.CREAM if _sort == "mastery" else UI.MUTED)
		crafts_l.custom_minimum_size.x = 76
		for c in [rank, UI.expand(who), gold_l, crafts_l]:
			c.mouse_filter = Control.MOUSE_FILTER_IGNORE
			r.add_child(c)
		if p.get("title") != null:
			b.custom_minimum_size.y = 76
		box.add_child(b)


# ---------------------------------------------------------------- profile

func _show_profile(player_id: int) -> void:
	_view = "profile"
	_profile_id = player_id
	var p := await _fetch(Session.player_profile.bind(player_id))
	if p.is_empty() or _view != "profile" or _profile_id != player_id:
		return
	UI.clear(_body)
	var back := UI.button("‹ All crafters", true, true)
	back.pressed.connect(_show_players)
	_body.add_child(back)

	var info := UI.card(_body, 4)
	info.add_child(UI.label(str(p["name"]) + ("  (you)" if p["me"] else ""), 26, UI.BRASS))
	if p.get("title") != null:
		info.add_child(UI.label(str(p["title"]) + ": the richest crafter in the city", 16, UI.BRASS))
	info.add_child(UI.label("%s · %s" % [p["profession"], _seen(p["seen_ago"])], 16, UI.MUTED))
	var nums := UI.row(info)
	for pair in [["Gold", UI.gold(int(p["gold"]))], ["Crafts made", str(p["crafted"])], ["Recipes", "%d/%d" % [p["recipes_known"], p["recipes_total"]]]]:
		var c := VBoxContainer.new()
		c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		c.add_child(UI.label(pair[0], 14, UI.MUTED))
		c.add_child(UI.label(pair[1], 20, UI.CREAM))
		nums.add_child(c)

	if p["can_trade"]:
		var trade := UI.button("Propose a trade")
		trade.name = "ProposeTrade"
		trade.pressed.connect(_show_compose.bind({"id": int(p["id"]), "name": p["name"]}))
		_body.add_child(trade)

	_body.add_child(UI.label("Shop window", 20, UI.BRASS))
	var listings: Array = p["listings"]
	if listings.is_empty():
		_body.add_child(UI.label("Nothing listed on the Exchange right now.", 16, UI.MUTED))
	for l in listings:
		var box := UI.card(_body, 4)
		var r := UI.row(box)
		r.add_child(UI.expand(UI.label("%s × %d" % [l["name"], l["quantity"]], 18)))
		r.add_child(UI.value(UI.gold(int(l["unit_price"])) + " each", 18, UI.BRASS))
		if not p["me"]:
			var buy := UI.button("Buy 1 for %s" % UI.gold(int(l["unit_price"])), true, true)
			buy.pressed.connect(func():
				var response: Dictionary = await game.run(buy, Session.buy_listing.bind(int(l["id"]), 1), "Bought 1 %s." % l["name"])
				if response["ok"] and is_inside_tree():
					_show_profile(player_id))
			box.add_child(buy)


# ---------------------------------------------------------------- compose an offer

func _show_compose(target: Dictionary) -> void:
	_view = "compose"
	_target = target
	_give = {}
	_ask = {}
	_give_gold = 0
	_ask_gold = 0
	if _catalog.is_empty():
		var data := await _fetch(Session.market)
		if data.is_empty() or _view != "compose":
			return
		_catalog = data["items"]
	_render_compose()


func _render_compose() -> void:
	UI.clear(_body)
	var back := UI.button("‹ Back to %s" % _target["name"], true, true)
	back.pressed.connect(_show_profile.bind(int(_target["id"])))
	_body.add_child(back)
	_body.add_child(UI.label("Trade with %s" % _target["name"], 24, UI.BRASS))
	_body.add_child(UI.label("What you offer is held until %s accepts or declines (or 24 hours pass). No fees. Both sides need something." % _target["name"], 15, UI.MUTED))

	# You give: from your bag, plus gold
	_body.add_child(UI.label("You give", 20, UI.BRASS))
	var give_box := UI.card(_body, 4)
	var inventory: Array = Session.state.get("inventory", [])
	if inventory.is_empty():
		give_box.add_child(UI.label("Your bag is empty.", 16, UI.MUTED))
	for item in inventory:
		_qty_row(give_box, _give, item["item_id"], "%s (have %d)" % [item["name"], item["quantity"]], int(item["quantity"]))
	_gold_row(give_box, "Gold (have %s)" % UI.gold(int(Session.state["player"]["gold"])), true, int(Session.state["player"]["gold"]))

	# You ask for: any item, plus gold
	_body.add_child(UI.label("You ask for", 20, UI.BRASS))
	var ask_box := UI.card(_body, 4)
	for item in _catalog:
		_qty_row(ask_box, _ask, item["item_id"], item["name"], MAX_ITEM_QTY)
	_gold_row(ask_box, "Gold", false, 100000)

	_note = UI.field("Note (optional)")
	_note.max_length = 140
	_body.add_child(_note)
	_summary = UI.label("", 17, UI.CREAM)
	_body.add_child(_summary)
	_update_summary()

	var send := UI.button("Send offer")
	send.name = "SendOffer"
	send.pressed.connect(func():
		if (_give.is_empty() and _give_gold == 0) or (_ask.is_empty() and _ask_gold == 0):
			game.say("Offer something and ask for something.", true)
			return
		var response: Dictionary = await game.run(send, Session.offer_create.bind(int(_target["id"]), _as_list(_give), _give_gold,
			_as_list(_ask), _ask_gold, _note.text), "Offer sent to %s." % _target["name"])
		if response["ok"] and is_inside_tree():
			set_mode("trades"))
	_body.add_child(send)


## name   − qty +   (updates the bundle in place, no re-render)
func _qty_row(parent: Control, bundle: Dictionary, item_id: String, text: String, hi: int) -> void:
	var r := UI.row(parent, 6)
	r.add_child(UI.expand(UI.label(text, 16)))
	var amount := UI.value(str(bundle.get(item_id, 0)), 18, UI.CREAM)
	amount.custom_minimum_size.x = 36
	amount.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	for step in [-1, 1]:
		var b := UI.button("−" if step < 0 else "+", true, true)
		b.custom_minimum_size.x = 44
		b.pressed.connect(func():
			var n: int = clamp(int(bundle.get(item_id, 0)) + step, 0, hi)
			if n == 0:
				bundle.erase(item_id)
			else:
				bundle[item_id] = n
			amount.text = str(n)
			_update_summary())
		r.add_child(b)
		if step < 0:
			r.add_child(amount)


func _gold_row(parent: Control, text: String, giving: bool, hi: int) -> void:
	parent.add_child(UI.label(text, 16, UI.BRASS))
	var r := UI.row(parent, 4)
	var amount := UI.value(str(_give_gold if giving else _ask_gold), 18, UI.CREAM)
	amount.custom_minimum_size.x = 56
	amount.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	amount.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var steps := [-100, -10, -1, 1, 10, 100]
	for i in steps.size():
		if i == 3:
			r.add_child(amount)
		var step: int = steps[i]
		var b := UI.button(("+" if step > 0 else "−") + str(abs(step)), true, true)
		b.custom_minimum_size.x = 50
		b.add_theme_font_size_override("font_size", 15)
		b.pressed.connect(func():
			var n: int = clamp((_give_gold if giving else _ask_gold) + step, 0, max(0, hi))
			if giving:
				_give_gold = n
			else:
				_ask_gold = n
			amount.text = str(n)
			_update_summary())
		r.add_child(b)


func _update_summary() -> void:
	if _summary:
		_summary.text = "You give: %s\nYou get: %s" % [_bundle_text(_give, _give_gold), _bundle_text(_ask, _ask_gold)]


func _bundle_text(bundle: Dictionary, gold_amount: int) -> String:
	var parts := PackedStringArray()
	for item_id in bundle:
		parts.append("%d %s" % [bundle[item_id], _item_name(item_id)])
	if gold_amount > 0:
		parts.append(UI.gold(gold_amount))
	return " + ".join(parts) if not parts.is_empty() else "nothing yet"


func _item_name(item_id: String) -> String:
	for item in _catalog:
		if item["item_id"] == item_id:
			return item["name"]
	return item_id


static func _as_list(bundle: Dictionary) -> Array:
	var out := []
	for item_id in bundle:
		out.append({"item_id": item_id, "quantity": int(bundle[item_id])})
	return out


# ---------------------------------------------------------------- trades inbox

func _show_trades() -> void:
	_view = "trades"
	var data := await _fetch(Session.trade_offers)
	if data.is_empty() or _view != "trades":
		return
	UI.clear(_body)

	_body.add_child(UI.label("Offers to you", 22, UI.BRASS))
	if data["incoming"].is_empty():
		_body.add_child(UI.label("None right now. Crafters can send you offers from your profile in Players.", 16, UI.MUTED))
	for o in data["incoming"]:
		var box := _offer_card(o)
		var r := UI.row(box, 8)
		var accept := UI.button("Accept")
		accept.name = "AcceptOffer"
		accept.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		accept.pressed.connect(_act.bind(accept, Session.offer_accept.bind(int(o["id"])), "Trade done with %s." % o["other"]))
		var decline := UI.button("Decline", true)
		decline.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		decline.pressed.connect(_act.bind(decline, Session.offer_decline.bind(int(o["id"])), "Offer declined."))
		r.add_child(accept)
		r.add_child(decline)

	_body.add_child(UI.label("Your offers", 22, UI.BRASS))
	if data["outgoing"].is_empty():
		_body.add_child(UI.label("None. Open a crafter in Players and tap Propose a trade.", 16, UI.MUTED))
	for o in data["outgoing"]:
		var box := _offer_card(o)
		var cancel := UI.button("Cancel (your side comes back)", true, true)
		cancel.pressed.connect(_act.bind(cancel, Session.offer_cancel.bind(int(o["id"])), "Offer cancelled."))
		box.add_child(cancel)

	if not data["closed"].is_empty():
		_body.add_child(UI.label("Recent", 20, UI.BRASS))
		var box := UI.card(_body, 6)
		for o in data["closed"]:
			var r := UI.row(box)
			r.add_child(UI.expand(UI.label("%s %s: you get %s for %s" % ["From" if o["incoming"] else "To", o["other"], o["you_get"], o["you_give"]], 15)))
			r.add_child(UI.value(str(o["status"]).capitalize(), 14, UI.OK_GREEN if o["status"] == "accepted" else UI.MUTED))


func _offer_card(o: Dictionary) -> VBoxContainer:
	var box := UI.card(_body, 6)
	var head := UI.row(box)
	head.add_child(UI.expand(UI.label(("From " if o["incoming"] else "To ") + str(o["other"]), 20, UI.CREAM)))
	head.add_child(UI.value("ends in " + UI.duration(int(o["seconds_left"])), 14, UI.MUTED))
	box.add_child(UI.label("You get: " + str(o["you_get"]), 17, UI.OK_GREEN))
	box.add_child(UI.label("You give: " + str(o["you_give"]), 17, UI.CREAM))
	if str(o["note"]) != "":
		box.add_child(UI.label("“%s”" % o["note"], 15, UI.MUTED))
	return box


func _act(button: Button, action: Callable, success: String) -> void:
	await game.run(button, action, success)
	if is_inside_tree():
		_show_trades()


# ---------------------------------------------------------------- helpers

func _fetch(call: Callable) -> Dictionary:
	_loading = true
	var response: Dictionary = await call.call()
	_loading = false
	if not is_inside_tree():
		return {}
	if not response["ok"]:
		game.say(Api.error_message(response), true)
		return {}
	return response["data"]


static func _seen(seconds: Variant) -> String:
	if seconds == null:
		return "never seen"
	var s := int(seconds)
	if s < 600:
		return "active now"
	if s < 3600:
		return "seen %dm ago" % (s / 60)
	if s < 86400:
		return "seen %dh ago" % (s / 3600)
	return "seen %dd ago" % (s / 86400)
