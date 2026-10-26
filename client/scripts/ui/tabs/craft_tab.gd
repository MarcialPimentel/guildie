## Craft: every recipe of your profession, what it needs, and how many to make (batches, systems.md 5.3).
extends Control

var game: Node

var _col: VBoxContainer
var _quantities := {}   # recipe_id -> chosen quantity


func _ready() -> void:
	_col = UI.scroll_column(self)


func render() -> void:
	var state := Session.state
	if state.is_empty() or state.get("profession") == null:
		return
	UI.clear(_col)
	var slots := int(state.get("craft_slots", 1))
	var busy: int = state.get("crafts", []).size()
	var free := slots - busy
	var header := UI.row(_col)
	header.add_child(UI.expand(UI.label("Recipes", 26, UI.BRASS)))
	header.add_child(UI.value("%d free slot%s" % [free, "" if free == 1 else "s"], 18, UI.OK_GREEN if free > 0 else UI.ERROR))

	for recipe in state["profession"]["recipes"]:
		_recipe_card(recipe, free > 0, int(state.get("max_batch", 10)))

	_col.add_child(UI.label("Blue inputs come from other guilds: buy them on the Market.", 15, UI.NPC_BLUE))


func _recipe_card(recipe: Dictionary, slot_free: bool, max_batch: int) -> void:
	var box := UI.card(_col, 6)
	var title := UI.row(box)
	title.add_child(UI.expand(UI.label(recipe["name"], 22, UI.BRASS)))
	title.add_child(UI.value("value ~%s" % UI.gold(int(recipe["value"])), 16, UI.MUTED))

	for input in recipe["inputs"]:
		var r := UI.row(box, 6)
		var enough: bool = int(input["have"]) >= int(input["quantity"])
		var color := UI.NPC_BLUE if input["from_other_profession"] else UI.CREAM
		r.add_child(UI.expand(UI.label("%d × %s" % [input["quantity"], input["name"]], 18, color)))
		r.add_child(UI.value("have %d" % input["have"], 16, UI.OK_GREEN if enough else UI.ERROR))

	var can_make := int(recipe["can_make"])
	var limit: int = max(1, min(can_make, max_batch))
	var qty: int = clamp(int(_quantities.get(recipe["id"], 1)), 1, limit)
	_quantities[recipe["id"]] = qty

	var controls := UI.row(box, 6)
	var minus := UI.button("−", true, true)
	minus.custom_minimum_size.x = 48
	var amount := UI.value(str(qty), 22, UI.CREAM)
	amount.custom_minimum_size.x = 36
	amount.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var plus := UI.button("+", true, true)
	plus.custom_minimum_size.x = 48
	var max_b := UI.button("Max", true, true)
	var time := UI.label(UI.duration(int(recipe["seconds_each"]) * qty), 16, UI.MUTED, HORIZONTAL_ALIGNMENT_RIGHT)
	for c in [minus, amount, plus, max_b]:
		controls.add_child(c)
	controls.add_child(UI.expand(time))

	var update := func(new_qty: int) -> void:
		new_qty = clamp(new_qty, 1, limit)
		_quantities[recipe["id"]] = new_qty
		amount.text = str(new_qty)
		time.text = UI.duration(int(recipe["seconds_each"]) * new_qty)
	minus.pressed.connect(func(): update.call(int(_quantities[recipe["id"]]) - 1))
	plus.pressed.connect(func(): update.call(int(_quantities[recipe["id"]]) + 1))
	max_b.pressed.connect(func(): update.call(limit))
	for c in [minus, plus, max_b]:
		c.disabled = can_make <= 1

	var craft := UI.button("Craft")
	if can_make == 0:
		craft.text = "Missing materials"
		craft.disabled = true
	elif not slot_free:
		craft.text = "No free slot"
		craft.disabled = true
	craft.pressed.connect(func():
		var n := int(_quantities[recipe["id"]])
		game.run(craft, Session.start_craft.bind(recipe["id"], n), "Started %d × %s." % [n, recipe["name"]]))
	box.add_child(craft)

