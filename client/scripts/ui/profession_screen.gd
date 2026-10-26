## Choose a profession (once). GDD 9: the identity moment.
extends Control

signal chosen

var _list: VBoxContainer
var _status: Label
var _buttons: Array[Button] = []


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var col := UI.screen_column(self)

	col.add_child(UI.spacer(12))
	col.add_child(UI.label("Choose your guild", 34, UI.BRASS))
	col.add_child(UI.label("This is your profession for now. You can learn a second one much later.", 18, UI.MUTED))

	_status = UI.label("Loading guilds…", 18, UI.MUTED)
	col.add_child(_status)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", 14)
	col.add_child(_list)
	_load()


func _load() -> void:
	var response := await Session.professions()
	if not is_inside_tree():
		return
	if not response["ok"]:
		_status.text = Api.error_message(response)
		_status.add_theme_color_override("font_color", UI.ERROR)
		return
	_status.text = ""
	for p in response["data"]["professions"]:
		var box := UI.card(_list, 6)
		box.add_child(UI.label(p["name"], 28, UI.BRASS))
		box.add_child(UI.label(p["tagline"], 18, UI.MUTED))
		box.add_child(UI.label(p["description"], 18))
		box.add_child(UI.label("Gathers: " + ", ".join(p["gathers"]) + " (" + p["station"] + ")", 16, UI.CREAM))
		box.add_child(UI.label("Makes: " + ", ".join(p["makes"]), 16, UI.CREAM))
		box.add_child(UI.label("Needs from others: " + p["needs_from_others"], 16, UI.NPC_BLUE))
		var b := UI.button("Join the %s guild" % p["name"])
		b.pressed.connect(_choose.bind(p["id"]))
		box.add_child(b)
		_buttons.append(b)


func _choose(profession_id: String) -> void:
	for b in _buttons:
		b.disabled = true
	_status.add_theme_color_override("font_color", UI.MUTED)
	_status.text = "Joining…"
	var response := await Session.choose_profession(profession_id)
	if not is_inside_tree():
		return
	if response["ok"]:
		chosen.emit()
	else:
		for b in _buttons:
			b.disabled = false
		_status.add_theme_color_override("font_color", UI.ERROR)
		_status.text = Api.error_message(response)
