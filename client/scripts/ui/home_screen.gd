## M0 home screen: shows server-owned gold and inventory (GDD 12, M0 exit criteria).
extends Control

const QUALITY_NAMES := {1: "", 2: " (Fine)", 3: " (Masterwork)"}

var _welcome: Label
var _gold: Label
var _inventory_list: VBoxContainer
var _status: Label
var _footer: Label
var _buttons: Array[Button] = []


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var col := UI.screen_column(self)

	col.add_child(UI.label("Brassmere Guild Hall", 18, UI.MUTED))
	_welcome = UI.label("", 34, UI.BRASS)
	col.add_child(_welcome)

	var gold_panel := PanelContainer.new()
	_gold = UI.label("", 30, UI.CREAM)
	gold_panel.add_child(_gold)
	col.add_child(gold_panel)

	col.add_child(UI.spacer(6))
	col.add_child(UI.label("Inventory", 24, UI.BRASS))
	var inv_panel := PanelContainer.new()
	_inventory_list = VBoxContainer.new()
	_inventory_list.add_theme_constant_override("separation", 8)
	inv_panel.add_child(_inventory_list)
	col.add_child(inv_panel)

	col.add_child(UI.spacer(6))
	_add_button(col, "Add test ore (+1)", _on_add_test_item)
	_add_button(col, "Refresh", _on_refresh)
	_add_button(col, "Log out", _on_logout)

	_status = UI.label("", 18, UI.MUTED, HORIZONTAL_ALIGNMENT_CENTER)
	col.add_child(_status)

	col.add_child(UI.spacer(10))
	_footer = UI.label("", 14, UI.MUTED, HORIZONTAL_ALIGNMENT_CENTER)
	col.add_child(_footer)

	Session.state_changed.connect(_render)
	_render(Session.state)


func _add_button(parent: Control, text: String, handler: Callable) -> void:
	var b := UI.button(text)
	b.pressed.connect(handler)
	parent.add_child(b)
	_buttons.append(b)


func _render(state: Dictionary) -> void:
	if state.is_empty():
		return
	var player: Dictionary = state.get("player", {})
	_welcome.text = "Welcome, %s" % player.get("name", "")
	_gold.text = "Gold: %s" % _format_number(int(player.get("gold", 0)))

	for child in _inventory_list.get_children():
		child.queue_free()
	var items: Array = state.get("inventory", [])
	if items.is_empty():
		_inventory_list.add_child(UI.label("Empty", 20, UI.MUTED))
	for item in items:
		var row := HBoxContainer.new()
		var name_label := UI.label(str(item.get("name", "?")) + QUALITY_NAMES.get(int(item.get("quality", 1)), ""), 22)
		name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(name_label)
		var qty_label := UI.label("× %d" % int(item.get("quantity", 0)), 22, UI.BRASS)
		qty_label.autowrap_mode = TextServer.AUTOWRAP_OFF
		row.add_child(qty_label)
		_inventory_list.add_child(row)

	_footer.text = UI.build_text()


func _on_add_test_item() -> void:
	await _run("Asking the server…", Session.add_test_item)


func _on_refresh() -> void:
	await _run("Refreshing…", Session.refresh)


func _on_logout() -> void:
	_set_busy(true)
	await Session.logout()


func _run(message: String, action: Callable) -> void:
	_set_busy(true)
	_status.add_theme_color_override("font_color", UI.MUTED)
	_status.text = message
	var response: Dictionary = await action.call()
	if not is_inside_tree():
		return  # logged out mid-request; this screen is gone
	_set_busy(false)
	if response["ok"]:
		_status.add_theme_color_override("font_color", UI.OK_GREEN)
		_status.text = "Saved on the server."
	else:
		_status.add_theme_color_override("font_color", UI.ERROR)
		_status.text = Api.error_message(response)


func _set_busy(busy: bool) -> void:
	for b in _buttons:
		b.disabled = busy


static func _format_number(n: int) -> String:
	var s := str(abs(n))
	var out := ""
	while s.length() > 3:
		out = "," + s.substr(s.length() - 3) + out
		s = s.substr(0, s.length() - 3)
	return ("-" if n < 0 else "") + s + out
