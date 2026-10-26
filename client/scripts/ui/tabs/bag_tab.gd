## Bag: everything you own, with today's market value.
extends Control

var game: Node

var _col: VBoxContainer


func _ready() -> void:
	_col = UI.scroll_column(self)


func render() -> void:
	var state := Session.state
	if state.is_empty():
		return
	UI.clear(_col)
	_col.add_child(UI.label("Your bag", 26, UI.BRASS))
	var items: Array = state.get("inventory", [])
	if items.is_empty():
		_col.add_child(UI.label("Empty. Collect from your station in the Workshop.", 18, UI.MUTED))
		return

	var box := UI.card(_col, 8)
	var total := 0
	for item in items:
		var r := UI.row(box)
		r.add_child(UI.expand(UI.label(item["name"])))
		r.add_child(UI.value("× %d" % item["quantity"], 20, UI.CREAM))
		var worth := int(item["quantity"]) * int(item["reference"])
		total += worth
		var w := UI.value("~" + UI.gold(worth), 16, UI.MUTED)
		w.custom_minimum_size.x = 90
		r.add_child(w)
	_col.add_child(UI.label("Estimated value: %s (at reference prices)" % UI.gold(total), 16, UI.MUTED))
	var sell := UI.button("Sell on the Market", true)
	sell.pressed.connect(func(): game.open_market("sell"))
	_col.add_child(sell)
