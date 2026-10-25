## Shared look and small builders for M0's plain UI. Placeholder styling until M4 (GDD 3, Visual direction).
class_name UI
extends RefCounted

const BG := Color("1b1816")
const PANEL := Color("2a211b")
const BRASS := Color("c9963f")
const BRASS_DARK := Color("8a6427")
const CREAM := Color("e8d5a8")
const MUTED := Color("9c8b74")
const ERROR := Color("e07a5f")
const OK_GREEN := Color("8fbf7a")

const MARGIN := 24
const BUTTON_HEIGHT := 56


static func make_theme() -> Theme:
	var theme := Theme.new()
	theme.default_font_size = 22

	theme.set_color("font_color", "Label", CREAM)

	var button := _box(BRASS, 10)
	var button_hover := _box(BRASS.lightened(0.12), 10)
	var button_pressed := _box(BRASS_DARK, 10)
	var button_disabled := _box(PANEL.lightened(0.08), 10)
	theme.set_stylebox("normal", "Button", button)
	theme.set_stylebox("hover", "Button", button_hover)
	theme.set_stylebox("pressed", "Button", button_pressed)
	theme.set_stylebox("disabled", "Button", button_disabled)
	theme.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	theme.set_color("font_color", "Button", BG)
	theme.set_color("font_hover_color", "Button", BG)
	theme.set_color("font_pressed_color", "Button", CREAM)
	theme.set_color("font_disabled_color", "Button", MUTED)

	var field := _box(PANEL, 8, MUTED)
	var field_focus := _box(PANEL, 8, BRASS)
	theme.set_stylebox("normal", "LineEdit", field)
	theme.set_stylebox("focus", "LineEdit", field_focus)
	theme.set_color("font_color", "LineEdit", CREAM)
	theme.set_color("font_placeholder_color", "LineEdit", MUTED)
	theme.set_color("caret_color", "LineEdit", BRASS)

	theme.set_stylebox("panel", "PanelContainer", _box(PANEL, 12))
	return theme


static func _box(color: Color, radius: int, border: Color = Color.TRANSPARENT) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = color
	box.set_corner_radius_all(radius)
	box.content_margin_left = 16
	box.content_margin_right = 16
	box.content_margin_top = 10
	box.content_margin_bottom = 10
	if border.a > 0.0:
		box.border_color = border
		box.set_border_width_all(2)
	return box


static func label(text: String, size: int = 22, color: Color = CREAM, align := HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = align
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	return l


static func button(text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size.y = BUTTON_HEIGHT
	return b


static func field(placeholder: String, secret := false) -> LineEdit:
	var f := LineEdit.new()
	f.placeholder_text = placeholder
	f.secret = secret
	f.custom_minimum_size.y = BUTTON_HEIGHT
	f.virtual_keyboard_enabled = true
	return f


## A full-screen scrolling column with phone-friendly margins.
static func screen_column(parent: Control) -> VBoxContainer:
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, MARGIN)
	parent.add_child(margin)

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	margin.add_child(scroll)

	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 14)
	scroll.add_child(column)
	return column


static func spacer(height: int) -> Control:
	var c := Control.new()
	c.custom_minimum_size.y = height
	return c


static func build_text() -> String:
	return "Client %s · Server %s" % [BuildInfo.CLIENT_BUILD, Session.server_build]
