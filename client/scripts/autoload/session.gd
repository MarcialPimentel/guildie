## The logged-in player's session and the latest state the server sent.
## The token is saved so players stay logged in between visits.
extends Node

signal logged_in
signal logged_out
signal state_changed(state: Dictionary)

const SAVE_PATH := "user://session.cfg"

var token: String = ""
## Last state from the server: {"player": {...}, "inventory": [...], "server_time": int, "build": String}
var state: Dictionary = {}
## Server build from the last ping or state (shown in the footer to confirm deploys).
var server_build: String = "?"


func _ready() -> void:
	_load_token()


func has_token() -> bool:
	return token != ""


## Check the server is reachable and learn its build number.
func ping() -> Dictionary:
	var response := await Api.call_action("ping")
	if response["ok"]:
		server_build = str(response["data"].get("build", "?"))
	return response


func register(player_name: String, password: String) -> Dictionary:
	return await _authenticate("register", player_name, password)


func login(player_name: String, password: String) -> Dictionary:
	return await _authenticate("login", player_name, password)


## Fetch fresh state from the server. Logs out locally if the session is no longer valid.
func refresh() -> Dictionary:
	var response := await Api.call_action("get_state")
	_handle(response)
	return response


## TEMPORARY (M0): asks the server to add one Copper Ore, proving server-side inventory works.
func add_test_item() -> Dictionary:
	var response := await Api.call_action("test_add_item", {"item_id": "copper_ore", "quantity": 1})
	_handle(response)
	return response


func logout() -> void:
	if has_token():
		await Api.call_action("logout", {})
	_clear()
	logged_out.emit()


func _authenticate(action: String, player_name: String, password: String) -> Dictionary:
	var response := await Api.call_action(action, {"name": player_name, "password": password})
	if response["ok"]:
		token = str(response["data"]["token"])
		_save_token()
		_set_state(response["data"]["state"])
		logged_in.emit()
	return response


func _handle(response: Dictionary) -> void:
	if response["ok"]:
		_set_state(response["data"])
	elif response.get("status", 0) == 401:
		_clear()
		logged_out.emit()


func _set_state(new_state: Dictionary) -> void:
	state = new_state
	server_build = str(state.get("build", server_build))
	state_changed.emit(state)


func _clear() -> void:
	token = ""
	state = {}
	_save_token()


func _load_token() -> void:
	var config := ConfigFile.new()
	if config.load(SAVE_PATH) == OK:
		token = str(config.get_value("session", "token", ""))


func _save_token() -> void:
	var config := ConfigFile.new()
	config.set_value("session", "token", token)
	config.save(SAVE_PATH)
