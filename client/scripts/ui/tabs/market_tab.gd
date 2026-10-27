## Market (the Exchange, systems.md 6.1): browse prices, buy, sell, and manage your listings.
## Views: browse -> item detail; sell list -> sell form; my listings.
extends Control

const PROFESSION_ORDER := ["blacksmith", "alchemist", "leatherworker"]
const PROFESSION_NAMES := {"blacksmith": "Blacksmith goods", "alchemist": "Alchemist goods", "leatherworker": "Leatherworker goods"}

var game: Node

var _mode_buttons := {}
var _body: VBoxContainer
var _mode := "browse"
var _view := "browse"          # browse | item | sell | sell_form | mine
var _item_id := ""
var _item_title := ""
var _loading := false

# sell form state
var _sell_qty := 1
var _sell_price := 1
var _sell_hours := 24
var _quote: Dictionary = {}


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
	for spec in [["browse", "Browse"], ["sell", "Sell"], ["mine", "My listings"]]:
		var b := UI.button(spec[1], true, true)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(set_mode.bind(spec[0]))
		modes.add_child(b)
		_mode_buttons[spec[0]] = b

	_body = UI.scroll_column(root)


func on_shown() -> void:
	set_mode(_mode)


func render() -> void:
	# State changed (e.g. gold). Only the sell list depends directly on inventory.
	if _view == "sell" and visible:
		_show_sell_list()


func on_background_refresh() -> void:
	if not visible or _loading:
		return
	match _view:
		"browse": _show_browse()
		"item": _show_item(_item_id)
		"mine": _show_mine()


## Open a specific mode (used by the Bag tab's "Sell" button).
func open(mode: String) -> void:
	set_mode(mode)


func set_mode(mode: String) -> void:
	_mode = mode
	for key in _mode_buttons:
		_mode_buttons[key].theme_type_variation = "TabOn" if key == mode else "SecondaryButton"
	match mode:
		"browse": _show_browse()
		"sell": _show_sell_list()
		"mine": _show_mine()


# ---------------------------------------------------------------- browse

func _show_browse() -> void:
	_view = "browse"
	var data := await _fetch(Session.market)
	if data.is_empty() or _view != "browse":
		return
	UI.clear(_body)
	_body.add_child(UI.label("Tap an item to buy or see recent sales. Lowest = cheapest anyone sells it for. Players = how many other players have listed. Prices move every few minutes as townsfolk, adventurers and workshops shop.", 15, UI.MUTED))

	var mine: String = Session.state["profession"]["id"]
	var groups := {}
	for item in data["items"]:
		groups.get_or_add(item["profession"], []).append(item)

	var order: Array = PROFESSION_ORDER.duplicate()
	order.erase(mine)
	order.push_front(mine)
	for prof in order:
		_body.add_child(UI.label(PROFESSION_NAMES.get(prof, prof) + (" (your guild)" if prof == mine else ""), 20, UI.BRASS))
		var box := UI.card(_body, 2)
		var head := UI.row(box)
		head.add_child(UI.expand(UI.label("Item", 14, UI.MUTED)))
		for h in ["Lowest", "Players", "Value"]:
			var l := UI.value(h, 14, UI.MUTED)
			l.custom_minimum_size.x = 70
			head.add_child(l)
		for item in groups.get(prof, []):
			var b := Button.new()
			b.flat = true
			b.custom_minimum_size.y = 44
			b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			b.pressed.connect(_show_item.bind(item["item_id"]))
			var r := HBoxContainer.new()
			r.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			r.mouse_filter = Control.MOUSE_FILTER_IGNORE
			b.add_child(r)
			var name_l := UI.label(item["name"], 18)
			name_l.mouse_filter = Control.MOUSE_FILTER_IGNORE
			r.add_child(UI.expand(name_l))
			var lowest = item["lowest"]
			var from_players := int(item["from_players"])
			for v in [UI.gold(int(lowest)) if lowest != null else "—", str(from_players) if from_players > 0 else "—", UI.gold(int(item["reference"]))]:
				var l := UI.value(v, 17, UI.CREAM)
				l.custom_minimum_size.x = 70
				l.mouse_filter = Control.MOUSE_FILTER_IGNORE
				r.add_child(l)
			box.add_child(b)


# ---------------------------------------------------------------- item detail + buying

func _show_item(item_id: String) -> void:
	_view = "item"
	_item_id = item_id
	var data := await _fetch(Session.market_item.bind(item_id))
	if data.is_empty() or _view != "item" or _item_id != item_id:
		return
	UI.clear(_body)
	_item_title = data["name"]
	var back := UI.button("‹ Back to all items", true, true)
	back.pressed.connect(_show_browse)
	_body.add_child(back)

	var info := UI.card(_body, 4)
	info.add_child(UI.label(data["name"], 26, UI.BRASS))
	info.add_child(UI.label(data["description"], 16, UI.MUTED))
	var nums := UI.row(info)
	for pair in [["Value", data["reference"]], ["Quick sale", data["trader_price"]], ["Suppliers", data["ceiling"]]]:
		var c := VBoxContainer.new()
		c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		c.add_child(UI.label(pair[0], 14, UI.MUTED))
		c.add_child(UI.label(UI.gold(int(pair[1])), 20, UI.CREAM))
		nums.add_child(c)
	info.add_child(UI.label("You have %d. Quick sale: traders buy anything listed at that price or less within a few minutes. Suppliers always sell a few at their price." % data["you_have"], 15, UI.MUTED))

	_body.add_child(UI.label("For sale", 20, UI.BRASS))
	var listings: Array = data["listings"]
	if listings.is_empty():
		_body.add_child(UI.label("Nothing listed right now.", 16, UI.MUTED))
	for l in listings:
		_listing_row(l)

	_body.add_child(UI.label("Recent sales", 20, UI.BRASS))
	var trades: Array = data["trades"]
	if trades.is_empty():
		_body.add_child(UI.label("No sales yet.", 16, UI.MUTED))
	var tbox := UI.card(_body, 4)
	for t in trades.slice(0, 12):
		var r := UI.row(tbox, 6)
		r.add_child(UI.expand(UI.label("%s sold %d to %s" % [str(t["seller"]).capitalize(), t["quantity"], t["buyer"]], 15)))
		r.add_child(UI.value(UI.gold(int(t["unit_price"])), 16, UI.CREAM))
		r.add_child(UI.value(_ago(int(t["ago"])), 14, UI.MUTED))


func _listing_row(l: Dictionary) -> void:
	var box := UI.card(_body, 6)
	var r := UI.row(box)
	var who := "You" if l["mine"] else str(l["seller"]).capitalize()
	r.add_child(UI.expand(UI.label(who, 18, UI.NPC_BLUE if l["is_npc"] else UI.CREAM)))
	r.add_child(UI.value("%d left" % l["quantity"], 16, UI.MUTED))
	r.add_child(UI.value(UI.gold(int(l["unit_price"])) + " each", 18, UI.BRASS))
	if l["mine"]:
		return

	var max_qty: int = int(l["quantity"])
	var qty := [1]
	var controls := UI.row(box, 6)
	var minus := UI.button("−", true, true)
	minus.custom_minimum_size.x = 44
	var amount := UI.value("1", 20, UI.CREAM)
	amount.custom_minimum_size.x = 32
	amount.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var plus := UI.button("+", true, true)
	plus.custom_minimum_size.x = 44
	var buy := UI.button("Buy for %s" % UI.gold(int(l["unit_price"])), false, true)
	buy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for c in [minus, amount, plus, buy]:
		controls.add_child(c)
	var update := func(n: int) -> void:
		qty[0] = clamp(n, 1, max_qty)
		amount.text = str(qty[0])
		buy.text = "Buy %d for %s" % [qty[0], UI.gold(qty[0] * int(l["unit_price"]))]
	minus.pressed.connect(func(): update.call(qty[0] - 1))
	plus.pressed.connect(func(): update.call(qty[0] + 1))
	update.call(1)
	buy.pressed.connect(func():
		var response: Dictionary = await game.run(buy, Session.buy_listing.bind(int(l["id"]), qty[0]),
			"Bought %d %s." % [qty[0], _item_title])
		if response["ok"] and is_inside_tree():
			_show_item(_item_id))


# ---------------------------------------------------------------- selling

func _show_sell_list() -> void:
	_view = "sell"
	UI.clear(_body)
	var items: Array = Session.state.get("inventory", [])
	_body.add_child(UI.label("Choose something to sell", 22, UI.BRASS))
	if items.is_empty():
		_body.add_child(UI.label("Your bag is empty.", 16, UI.MUTED))
	for item in items:
		var box := UI.card(_body, 4)
		var r := UI.row(box)
		r.add_child(UI.expand(UI.label("%s × %d" % [item["name"], item["quantity"]])))
		r.add_child(UI.value("value ~" + UI.gold(int(item["reference"])), 16, UI.MUTED))
		var b := UI.button("Sell…", true, true)
		b.pressed.connect(_show_sell_form.bind(item["item_id"], int(item["quantity"])))
		box.add_child(b)


func _show_sell_form(item_id: String, have: int) -> void:
	_view = "sell_form"
	_item_id = item_id
	_sell_qty = have
	_quote = await _fetch(Session.sell_quote.bind(item_id, _sell_qty))
	if _quote.is_empty() or _view != "sell_form":
		return
	_sell_price = int(_quote["reference"])
	if _quote["lowest_player"] != null and int(_quote["lowest_player"]) < _sell_price:
		_sell_price = max(1, int(_quote["lowest_player"]) - 1)
	_sell_hours = 24
	_render_sell_form()


func _render_sell_form() -> void:
	UI.clear(_body)
	var back := UI.button("‹ Back", true, true)
	back.pressed.connect(_show_sell_list)
	_body.add_child(back)

	var q := _quote
	var box := UI.card(_body, 8)
	box.add_child(UI.label("Sell %s" % q["name"], 24, UI.BRASS))
	var lowest_text: String = UI.gold(int(q["lowest_player"])) if q["lowest_player"] != null else "none"
	box.add_child(UI.label("Value %s · lowest player price %s · traders buy instantly at %s or less"
		% [UI.gold(int(q["reference"])), lowest_text, UI.gold(int(q["trader_price"]))], 15, UI.MUTED))

	# Quantity (shared by the guild sale and the listing)
	box.add_child(UI.label("Quantity (you have %d)" % q["you_have"], 16, UI.CREAM))
	_stepper(box, _sell_qty, 1, int(q["you_have"]), func(n):
		_sell_qty = n
		_requote())

	if q.get("type", "") == "raw":
		box.add_child(UI.label("No city buyers for raw materials: craft them, or list them for other players. Traders only buy at the quick-sale price or less.", 15, UI.NPC_BLUE))

	box = UI.card(_body, 8)
	box.add_child(UI.label("List on the Exchange", 20, UI.BRASS))
	box.add_child(UI.label("The best price, but you wait for a buyer. The city shops every few minutes.", 15, UI.MUTED))

	# Price
	box.add_child(UI.label("Price each", 16, UI.CREAM))
	_stepper(box, _sell_price, 1, int(q["ceiling"]) * 10, func(n):
		_sell_price = n
		_render_sell_form(), true)
	var presets := UI.row(box, 6)
	for preset in [["Value", int(q["reference"])], ["Undercut", max(1, int(q["lowest_player"]) - 1) if q["lowest_player"] != null else int(q["reference"])], ["Quick sale", int(q["trader_price"])]]:
		var pb := UI.button("%s %s" % [preset[0], UI.gold(preset[1])], true, true)
		pb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		pb.add_theme_font_size_override("font_size", 15)
		pb.pressed.connect(func():
			_sell_price = preset[1]
			_render_sell_form())
		presets.add_child(pb)

	# Duration
	box.add_child(UI.label("Listing lasts", 16, UI.CREAM))
	var durations := UI.row(box, 6)
	for h in q["deposits"].keys():
		var db := UI.button("%sh" % h, true, true)
		db.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if int(h) == _sell_hours:
			db.theme_type_variation = "TabOn"
		db.pressed.connect(func():
			_sell_hours = int(h)
			_render_sell_form())
		durations.add_child(db)

	# Summary
	var total := _sell_qty * _sell_price
	var cut := int(ceil(total * int(q["cut_percent"]) / 100.0))
	var deposit := int(q["deposits"].get(str(_sell_hours), 0))
	var summary := UI.card(_body, 4)
	for line in [["Total if all sell", UI.gold(total)], ["Exchange cut (%d%%)" % q["cut_percent"], "−" + UI.gold(cut)],
			["Deposit (taken from the sale)", "−" + UI.gold(deposit)], ["You'd earn", UI.gold(max(0, total - cut - deposit))]]:
		var r := UI.row(summary)
		r.add_child(UI.expand(UI.label(line[0], 17)))
		r.add_child(UI.value(line[1], 18, UI.CREAM))
	if _sell_price > int(q["ceiling"]):
		_body.add_child(UI.label("Guild suppliers sell this for %s, so few will pay more." % UI.gold(int(q["ceiling"])), 15, UI.ERROR))

	var list := UI.button("List %d for %s each" % [_sell_qty, UI.gold(_sell_price)])
	list.pressed.connect(func():
		var response: Dictionary = await game.run(list, Session.list_item.bind(_item_id, _sell_qty, _sell_price, _sell_hours),
			"Listed %d %s." % [_sell_qty, q["name"]])
		if response["ok"] and is_inside_tree():
			set_mode("mine"))
	_body.add_child(list)

	_guild_sale_card()   # the fallback, below the Exchange (#37)


## Instant sale to the guild: low price, paid now, no listing (#28). Shows the exact total before selling.
func _guild_sale_card() -> void:
	var g: Dictionary = _quote.get("guild", {})
	if g.is_empty():
		return
	var box := UI.card(_body, 6)
	box.add_child(UI.label("Or sell to the guild now", 20, UI.BRASS))
	box.add_child(UI.label("Instant gold, no listing and no fees, but a low price. Handy when you need gold right away.", 15, UI.MUTED))
	if g.get("hint") != null:
		box.add_child(UI.label(str(g["hint"]), 15, UI.ERROR))
	var total := int(g["total"])
	var sell := UI.button("Sell %d to the guild for %s" % [int(g["quantity"]), UI.gold(total)], true)
	sell.name = "SellToGuild"
	sell.pressed.connect(func():
		var response: Dictionary = await game.run(sell, Session.sell_to_guild.bind(_item_id, int(g["quantity"]), total),
			"Sold %d %s to the guild for %s." % [int(g["quantity"]), _quote["name"], UI.gold(total)])
		if not is_inside_tree():
			return
		if response["ok"]:
			_show_sell_list()
		elif response.get("error", {}).get("code", "") == "price_changed":
			_requote())
	box.add_child(sell)


func _requote() -> void:
	var q := await _fetch(Session.sell_quote.bind(_item_id, _sell_qty))
	if not q.is_empty() and _view == "sell_form":
		_quote = q
		_render_sell_form()


## − value + stepper; big=true adds ±10 buttons.
func _stepper(parent: Control, current: int, lo: int, hi: int, on_change: Callable, big := false) -> void:
	var r := UI.row(parent, 6)
	var steps := [-10, -1, 1, 10] if big else [-1, 1]
	var value_label := UI.value(str(current), 22, UI.CREAM)
	value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	value_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for i in steps.size():
		if i == steps.size() / 2:
			r.add_child(value_label)
		var step: int = steps[i]
		var b := UI.button(("+" if step > 0 else "−") + str(abs(step)), true, true)
		b.custom_minimum_size.x = 56
		b.pressed.connect(func():
			var n: int = clamp(int(value_label.text) + step, lo, max(lo, hi))
			value_label.text = str(n)
			on_change.call(n))
		r.add_child(b)


# ---------------------------------------------------------------- my listings

func _show_mine() -> void:
	_view = "mine"
	var data := await _fetch(Session.my_listings)
	if data.is_empty() or _view != "mine":
		return
	UI.clear(_body)
	var listings: Array = data["listings"]
	var active := listings.filter(func(l): return l["status"] == "active")
	var closed := listings.filter(func(l): return l["status"] != "active")
	_body.add_child(UI.label("Active listings (%d)" % active.size(), 22, UI.BRASS))
	if active.is_empty():
		_body.add_child(UI.label("Nothing listed. Use Sell to list items.", 16, UI.MUTED))
	for l in active:
		var box := UI.card(_body, 4)
		var r := UI.row(box)
		r.add_child(UI.expand(UI.label("%s × %d" % [l["name"], l["quantity"]])))
		r.add_child(UI.value(UI.gold(int(l["unit_price"])) + " each", 18, UI.BRASS))
		box.add_child(UI.label("Sold %d of %d · ends in %s" % [l["sold"], l["original"], UI.duration(int(l["seconds_left"]))], 15, UI.MUTED))
		var cancel := UI.button("Cancel (items come back)", true, true)
		cancel.pressed.connect(func():
			var response: Dictionary = await game.run(cancel, Session.cancel_listing.bind(int(l["id"])), "Listing cancelled.")
			if response["ok"] and is_inside_tree():
				_show_mine())
		box.add_child(cancel)

	if not closed.is_empty():
		_body.add_child(UI.label("Recently closed", 20, UI.BRASS))
		var box := UI.card(_body, 4)
		for l in closed:
			var r := UI.row(box)
			r.add_child(UI.expand(UI.label("%s: sold %d of %d" % [l["name"], l["sold"], l["original"]], 16)))
			r.add_child(UI.value(str(l["status"]).capitalize(), 15, UI.MUTED))


# ---------------------------------------------------------------- helpers

## Call a Session method returning a response; show errors; return data or {}.
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


static func _ago(seconds: int) -> String:
	if seconds < 60:
		return "now"
	if seconds < 3600:
		return "%dm ago" % (seconds / 60)
	if seconds < 86400:
		return "%dh ago" % (seconds / 3600)
	return "%dd ago" % (seconds / 86400)
