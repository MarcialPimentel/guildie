## Shared look and small builders for the plain M1 UI. Placeholder styling until M4 (GDD 3, Visual direction).
class_name UI
extends RefCounted

const BG := Color("1b1816")
const PANEL := Color("2a211b")
const PANEL_LIGHT := Color("3a2e25")
const BRASS := Color("c9963f")
const BRASS_DARK := Color("8a6427")
const CREAM := Color("e8d5a8")
const MUTED := Color("9c8b74")
const ERROR := Color("e07a5f")
const OK_GREEN := Color("8fbf7a")
const NPC_BLUE := Color("8fb3c9")

const MARGIN := 16
const BUTTON_HEIGHT := 52
const SMALL_BUTTON_HEIGHT := 40


static func make_theme() -> Theme:
	var theme := Theme.new()
	theme.default_font_size = 20

	theme.set_color("font_color", "Label", CREAM)

	_button_styles(theme, "Button", BRASS, BG)
	theme.set_stylebox("focus", "Button", StyleBoxEmpty.new())

	# Secondary buttons: outlined, used for less important actions and tabs.
	theme.add_type("SecondaryButton")
	theme.set_type_variation("SecondaryButton", "Button")
	theme.set_stylebox("normal", "SecondaryButton", _box(PANEL, 8, BRASS_DARK))
	theme.set_stylebox("hover", "SecondaryButton", _box(PANEL_LIGHT, 8, BRASS))
	theme.set_stylebox("pressed", "SecondaryButton", _box(BRASS_DARK, 8, BRASS))
	theme.set_stylebox("disabled", "SecondaryButton", _box(PANEL, 8, PANEL_LIGHT))
	theme.set_color("font_color", "SecondaryButton", CREAM)
	theme.set_color("font_hover_color", "SecondaryButton", CREAM)
	theme.set_color("font_pressed_color", "SecondaryButton", CREAM)
	theme.set_color("font_disabled_color", "SecondaryButton", MUTED)

	# Selected tab
	theme.add_type("TabOn")
	theme.set_type_variation("TabOn", "Button")
	_button_styles(theme, "TabOn", BRASS, BG)

	var field := _box(PANEL, 8, MUTED)
	var field_focus := _box(PANEL, 8, BRASS)
	theme.set_stylebox("normal", "LineEdit", field)
	theme.set_stylebox("focus", "LineEdit", field_focus)
	theme.set_color("font_color", "LineEdit", CREAM)
	theme.set_color("font_placeholder_color", "LineEdit", MUTED)
	theme.set_color("caret_color", "LineEdit", BRASS)

	theme.set_stylebox("panel", "PanelContainer", _box(PANEL, 12))
	return theme


static func _button_styles(theme: Theme, type: String, color: Color, font: Color) -> void:
	theme.set_stylebox("normal", type, _box(color, 8))
	theme.set_stylebox("hover", type, _box(color.lightened(0.12), 8))
	theme.set_stylebox("pressed", type, _box(color.darkened(0.25), 8))
	theme.set_stylebox("disabled", type, _box(PANEL_LIGHT, 8))
	theme.set_color("font_color", type, font)
	theme.set_color("font_hover_color", type, font)
	theme.set_color("font_pressed_color", type, CREAM)
	theme.set_color("font_disabled_color", type, MUTED)


static func _box(color: Color, radius: int, border: Color = Color.TRANSPARENT) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = color
	box.set_corner_radius_all(radius)
	box.content_margin_left = 14
	box.content_margin_right = 14
	box.content_margin_top = 8
	box.content_margin_bottom = 8
	if border.a > 0.0:
		box.border_color = border
		box.set_border_width_all(2)
	return box


# ---------------------------------------------------------------- builders

static func label(text: String, size: int = 20, color: Color = CREAM, align := HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = align
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	return l


## A label that never wraps (numbers, prices).
static func value(text: String, size: int = 20, color: Color = BRASS) -> Label:
	var l := label(text, size, color, HORIZONTAL_ALIGNMENT_RIGHT)
	l.autowrap_mode = TextServer.AUTOWRAP_OFF
	return l


static func button(text: String, secondary := false, small := false) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size.y = SMALL_BUTTON_HEIGHT if small else BUTTON_HEIGHT
	if secondary:
		b.theme_type_variation = "SecondaryButton"
	if small:
		b.add_theme_font_size_override("font_size", 18)
	return b


static func field(placeholder: String, secret := false) -> LineEdit:
	var f := LineEdit.new()
	f.placeholder_text = placeholder
	f.secret = secret
	f.custom_minimum_size.y = BUTTON_HEIGHT
	f.virtual_keyboard_enabled = true
	return f


## A rounded panel with a vertical stack inside. Returns the stack.
static func card(parent: Control, separation := 8) -> VBoxContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", separation)
	panel.add_child(box)
	return box


## A horizontal row. Children added with expand=true fill the space.
static func row(parent: Control, separation := 10) -> HBoxContainer:
	var r := HBoxContainer.new()
	r.add_theme_constant_override("separation", separation)
	r.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(r)
	return r


static func expand(c: Control) -> Control:
	c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return c


static func spacer(height: int) -> Control:
	var c := Control.new()
	c.custom_minimum_size.y = height
	return c


static func clear(node: Node) -> void:
	for child in node.get_children():
		node.remove_child(child)
		child.queue_free()


## A scrolling column filling the parent, with phone-friendly margins.
static func scroll_column(parent: Control, separation := 12) -> VBoxContainer:
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if not parent is Container:
		# A plain Control parent doesn't lay out its children: fill it explicitly.
		scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	parent.add_child(scroll)

	var margin := MarginContainer.new()
	margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, MARGIN)
	scroll.add_child(margin)

	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", separation)
	margin.add_child(column)
	return column


## Full-screen scrolling column (used by login and profession screens).
static func screen_column(parent: Control) -> VBoxContainer:
	var holder := VBoxContainer.new()
	holder.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	parent.add_child(holder)
	return scroll_column(holder, 14)


# ---------------------------------------------------------------- formatting

static func gold(n: int) -> String:
	return "%sg" % number(n)


static func number(n: int) -> String:
	var s := str(abs(n))
	var out := ""
	while s.length() > 3:
		out = "," + s.substr(s.length() - 3) + out
		s = s.substr(0, s.length() - 3)
	return ("-" if n < 0 else "") + s + out


## 75 -> "1m 15s", 3700 -> "1h 1m"
static func duration(seconds: int) -> String:
	seconds = max(0, seconds)
	if seconds < 60:
		return "%ds" % seconds
	if seconds < 3600:
		return "%dm %02ds" % [seconds / 60, seconds % 60]
	return "%dh %02dm" % [seconds / 3600, (seconds % 3600) / 60]


static func build_text() -> String:
	return "Client %s · Server %s" % [BuildInfo.CLIENT_BUILD, Session.server_build]
