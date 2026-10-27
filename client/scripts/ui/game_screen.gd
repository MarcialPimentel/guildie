## The main game screen: header (name, guild, gold), the current tab, a message line, and the tab bar.
## Tabs: Workshop, Craft, Market, Bag. Each tab is a Control with render() and (optionally) on_shown().
extends Control

const WorkshopTab := preload("res://scripts/ui/tabs/workshop_tab.gd")
const CraftTab := preload("res://scripts/ui/tabs/craft_tab.gd")
const MarketTab := preload("res://scripts/ui/tabs/market_tab.gd")
const BagTab := preload("res://scripts/ui/tabs/bag_tab.gd")

const TAB_SPECS := [["Workshop", WorkshopTab], ["Craft", CraftTab], ["Market", MarketTab], ["Bag", BagTab]]
const REFRESH_SECONDS := 20.0
const FEEDBACK_MAX_CHARS := 1000

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
var _feedback: Control = null


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
	header.add_theme_constant_override("separation", 10)
	_name = UI.label("", 20, UI.CREAM)
	header.add_child(UI.expand(_name))
	_gold = UI.value("", 24, UI.BRASS)
	header.add_child(_gold)
	var feedback := UI.button("Feedback", true, true)
	feedback.name = "FeedbackButton"
	feedback.add_theme_font_size_override("font_size", 15)
	feedback.pressed.connect(open_feedback)
	header.add_child(feedback)

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

	for spec in TAB_SPECS:
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


## Open the Market's sell form for one item (used by the Bag's Sell buttons).
func open_sell_form(item_id: String, quantity: int) -> void:
	open_market("sell")
	_tabs[2].call("_show_sell_form", item_id, quantity)


## Which screen the player is on, saved with feedback (e.g. "Market/sell_form").
func current_screen() -> String:
	if _current < 0:
		return ""
	var screen: String = TAB_SPECS[_current][0]
	var view: Variant = _tabs[_current].get("_view")
	return screen + ("/" + str(view) if view != null else "")


## Feedback pop-up (#29): a text box that sends a note to Marz with the build, screen and gold attached.
func open_feedback() -> void:
	if _feedback != null:
		return
	var screen := current_screen()
	_feedback = Control.new()
	_feedback.name = "FeedbackPopup"
	_feedback.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_feedback)
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.6)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_feedback.add_child(dim)

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right"]:
		margin.add_theme_constant_override("margin_" + side, UI.MARGIN)
	margin.add_theme_constant_override("margin_top", 70)
	margin.add_theme_constant_override("margin_bottom", 70)
	_feedback.add_child(margin)
	var box := UI.card(margin, 10)
	box.get_parent().size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	box.add_child(UI.label("Send feedback", 24, UI.BRASS))
	box.add_child(UI.label("What's fun, confusing, broken or boring? Marz reads every note. Your screen, gold and the build number are attached.", 15, UI.MUTED))

	var text := TextEdit.new()
	text.name = "FeedbackText"
	text.custom_minimum_size.y = 200
	text.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	text.placeholder_text = "Type here…"
	text.add_theme_stylebox_override("normal", UI._box(UI.BG, 8, UI.MUTED))
	text.add_theme_stylebox_override("focus", UI._box(UI.BG, 8, UI.BRASS))
	text.add_theme_color_override("font_color", UI.CREAM)
	text.add_theme_font_size_override("font_size", 18)
	box.add_child(text)
	var count := UI.label("0 / %d" % FEEDBACK_MAX_CHARS, 14, UI.MUTED, HORIZONTAL_ALIGNMENT_RIGHT)
	box.add_child(count)
	text.text_changed.connect(func():
		count.text = "%d / %d" % [text.text.length(), FEEDBACK_MAX_CHARS]
		count.add_theme_color_override("font_color", UI.ERROR if text.text.length() > FEEDBACK_MAX_CHARS else UI.MUTED))

	var error := UI.label("", 15, UI.ERROR)
	box.add_child(error)
	var buttons := UI.row(box, 8)
	var cancel := UI.button("Cancel", true)
	cancel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cancel.pressed.connect(close_feedback)
	buttons.add_child(cancel)
	var send := UI.button("Send")
	send.name = "SendFeedback"
	send.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	send.pressed.connect(func():
		var message := text.text.strip_edges()
		if message == "":
			error.text = "Write something first."
			return
		error.text = ""
		var response: Dictionary = await run(send, Session.send_feedback.bind(message, screen), "Thanks! Feedback sent.")
		if response["ok"]:
			close_feedback()
		elif is_instance_valid(error):
			error.text = Api.error_message(response))
	buttons.add_child(send)
	text.grab_focus()


func close_feedback() -> void:
	if _feedback != null:
		_feedback.queue_free()
		_feedback = null


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
