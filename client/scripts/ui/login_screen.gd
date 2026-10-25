## Log in or create an account (name + simple password, GDD 11.2.1).
extends Control

var _name_field: LineEdit
var _password_field: LineEdit
var _login_button: Button
var _register_button: Button
var _status: Label
var _footer: Label


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var col := UI.screen_column(self)

	col.add_child(UI.spacer(60))
	col.add_child(UI.label("Guildie", 56, UI.BRASS, HORIZONTAL_ALIGNMENT_CENTER))
	col.add_child(UI.label("Rise from apprentice to master in a guild city on the edge of the steam age.", 20, UI.MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	col.add_child(UI.spacer(30))

	_name_field = UI.field("Name")
	_name_field.max_length = 20
	col.add_child(_name_field)

	_password_field = UI.field("Password", true)
	_password_field.max_length = 72
	_password_field.text_submitted.connect(func(_t): _submit(false))
	col.add_child(_password_field)

	_login_button = UI.button("Log in")
	_login_button.pressed.connect(_submit.bind(false))
	col.add_child(_login_button)

	_register_button = UI.button("Create account")
	_register_button.pressed.connect(_submit.bind(true))
	col.add_child(_register_button)

	_status = UI.label("", 20, UI.ERROR, HORIZONTAL_ALIGNMENT_CENTER)
	col.add_child(_status)

	col.add_child(UI.label("Names: 3–20 letters, numbers, _ or -. Passwords: at least 4 characters.", 16, UI.MUTED, HORIZONTAL_ALIGNMENT_CENTER))
	col.add_child(UI.spacer(20))

	_footer = UI.label(UI.build_text(), 14, UI.MUTED, HORIZONTAL_ALIGNMENT_CENTER)
	col.add_child(_footer)

	_name_field.grab_focus()
	_check_server()


func _check_server() -> void:
	var response := await Session.ping()
	if not is_inside_tree():
		return
	if response["ok"]:
		_footer.text = UI.build_text()
	else:
		_footer.text = UI.build_text() + " · server unreachable"
		_footer.add_theme_color_override("font_color", UI.ERROR)


func _submit(is_register: bool) -> void:
	var player_name := _name_field.text.strip_edges()
	var password := _password_field.text
	if player_name == "" or password == "":
		_show_error("Enter a name and password.")
		return

	_set_busy(true, "Creating account…" if is_register else "Logging in…")
	var response: Dictionary
	if is_register:
		response = await Session.register(player_name, password)
	else:
		response = await Session.login(player_name, password)

	# On success, Main swaps to the home screen via Session.logged_in.
	if not response["ok"]:
		_set_busy(false)
		_show_error(Api.error_message(response))


func _set_busy(busy: bool, message := "") -> void:
	_login_button.disabled = busy
	_register_button.disabled = busy
	_status.add_theme_color_override("font_color", UI.MUTED)
	_status.text = message


func _show_error(message: String) -> void:
	_status.add_theme_color_override("font_color", UI.ERROR)
	_status.text = message
