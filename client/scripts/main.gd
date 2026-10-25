## Root of the game: shows the login screen or the home screen depending on the session.
extends Control

const LoginScreen := preload("res://scripts/ui/login_screen.gd")
const HomeScreen := preload("res://scripts/ui/home_screen.gd")

var _current: Control


func _ready() -> void:
	theme = UI.make_theme()

	var background := ColorRect.new()
	background.color = UI.BG
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)

	Session.logged_in.connect(_show_home)
	Session.logged_out.connect(_show_login)

	if Session.has_token():
		_show_loading()
		var response := await Session.refresh()
		if response["ok"]:
			_show_home()
		elif response.get("status", 0) != 401:
			# Server unreachable: still show login so the player sees the error and can retry.
			_show_login()
			_current.call("_show_error", Api.error_message(response))
		# On 401, Session already emitted logged_out, which showed the login screen.
	else:
		_show_login()


func _show_loading() -> void:
	var loading := Control.new()
	loading.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var l := UI.label("Opening the guild hall…", 24, UI.MUTED, HORIZONTAL_ALIGNMENT_CENTER)
	l.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	l.grow_horizontal = Control.GROW_DIRECTION_BOTH
	loading.add_child(l)
	_swap(loading)


func _show_login() -> void:
	_swap(LoginScreen.new())


func _show_home() -> void:
	_swap(HomeScreen.new())


func _swap(screen: Control) -> void:
	if _current:
		_current.queue_free()
	_current = screen
	add_child(screen)
