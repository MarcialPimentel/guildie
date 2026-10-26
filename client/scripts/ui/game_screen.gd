## The main game screen: header (name, guild, gold), the current tab, a message line, and the tab bar.
## Tabs: Workshop, Craft, Market, Bag. Each tab is a Control with render() and (optionally) on_shown().
extends Control

const WorkshopTab := preload("res://scripts/ui/tabs/workshop_tab.gd")
const CraftTab := preload("res://scripts/ui/tabs/craft_tab.gd")
const MarketTab := preload("res://scripts/ui/tabs/market_tab.gd")
const BagTab := preload("res://scripts/ui/tabs/bag_tab.gd")

const REFRESH_SECONDS := 20.0

## Emitted once a second so tabs can update countdowns.
signal second

var _name: Label
var _gold: Label
var _content: Control
var _message: Label
var _tab_buttons: Array[Button] = []
var _tabs: Array[Control] = []
var _current := -1
var _refresh_timer := 0.0
var _second_timer := 0.0
var _message_timer := 0.0
var _refreshing := false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var root := VBoxContainer.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 0)
	add_child(root)

	# Header
	var header_panel := PanelContainer.new()
	var header_style := UI._box(UI.PANEL, 0)
	header_style.content_margin_left = UI.MARGIN
	header_style.content_margin_right = UI.MARGIN
	header_style.content_margin_top = 10
	header_style.content_margin_bottom = 10
	header_panel.add_theme_stylebox_override("panel", header_style)
	root.add_child(header_panel)
	var header := HBoxContainer.new()
	header_panel.add_child(header)
	_name = UI.label("", 20, UI.CREAM)
	header.add_child(UI.expand(_name))
	_gold = UI.value("", 24, UI.BRASS)
	header.add_child(_gold)

	# Content
	_content = Control.new()
	_content.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_content.clip_contents = true
	root.add_child(_content)

	# Message line
	_message = UI.label("", 16, UI.MUTED, HORIZONTAL_ALIGNMENT_CENTER)
	_message.custom_minimum_size.y = 26
	root.add_child(_message)

	# Tab bar
	var bar_margin := MarginContainer.new()
	for side in ["left", "right"]:
		bar_margin.add_theme_constant_override("margin_" + side, 8)
	bar_margin.add_theme_constant_override("margin_bottom", 8)
	root.add_child(bar_margin)
	var bar := HBoxContainer.new()
	bar.add_theme_constant_override("separation", 6)
	bar_margin.add_child(bar)

	for spec in [["Workshop", WorkshopTab], ["Craft", CraftTab], ["Market", MarketTab], ["Bag", BagTab]]:
		var tab: Control = spec[1].new()
		tab.set("game", self)
		tab.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		tab.visible = false
		_content.add_child(tab)
		_tabs.append(tab)
		var b := UI.button(spec[0], true, true)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.custom_minimum_size.y = 48
		b.pressed.connect(show_tab.bind(_tabs.size() - 1))
		bar.add_child(b)
		_tab_buttons.append(b)

	Session.state_changed.connect(_on_state)
	_on_state(Session.state)
	show_tab(0)


func _process(delta: float) -> void:
	_second_timer += delta
	if _second_timer >= 1.0:
		_second_timer = 0.0
		second.emit()
	_refresh_timer += delta
	if _refresh_timer >= REFRESH_SECONDS:
		_refresh_timer = 0.0
		_background_refresh()
	if _message_timer > 0.0:
		_message_timer -= delta
		if _message_timer <= 0.0:
			_message.text = ""


func show_tab(index: int) -> void:
	if _current >= 0:
		_tabs[_current].visible = false
	_current = index
	_tabs[index].visible = true
	for i in _tab_buttons.size():
		_tab_buttons[i].theme_type_variation = "TabOn" if i == index else "SecondaryButton"
	if _tabs[index].has_method("on_shown"):
		_tabs[index].call("on_shown")
	else:
		_tabs[index].call("render")


## Switch to the Market tab in a given mode ("browse", "sell", "mine").
func open_market(mode: String) -> void:
	_tabs[2].set("_mode", mode)
	show_tab(2)


## Show a short message above the tab bar.
func say(text: String, is_error := false) -> void:
	_message.text = text
	_message.add_theme_color_override("font_color", UI.ERROR if is_error else UI.OK_GREEN)
	_message_timer = 6.0


## Run a server action from a button: disables the button while waiting, reports errors.
## Returns the response.
func run(button: Button, action: Callable, success_text := "") -> Dictionary:
	if button:
		button.disabled = true
	_message.text = ""
	var response: Dictionary = await action.call()
	if not is_inside_tree():
		return response
	if button and is_instance_valid(button):
		button.disabled = false
	if response["ok"]:
		if success_text != "":
			say(success_text)
	else:
		say(Api.error_message(response), true)
	_refresh_timer = 0.0
	return response


func _on_state(state: Dictionary) -> void:
	if state.is_empty() or not is_inside_tree():
		return
	var player: Dictionary = state["player"]
	var profession: Variant = state.get("profession")
	_name.text = "%s · %s" % [player["name"], profession["name"] if profession else "No guild"]
	_gold.text = UI.gold(int(player["gold"]))
	if _current >= 0 and _tabs[_current].has_method("render"):
		_tabs[_current].call("render")


func _background_refresh() -> void:
	if _refreshing:
		return
	_refreshing = true
	await Session.refresh()
	_refreshing = false
	if is_inside_tree() and _current >= 0 and _tabs[_current].has_method("on_background_refresh"):
		_tabs[_current].call("on_background_refresh")
