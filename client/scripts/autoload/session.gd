## The logged-in player's session and the latest state the server sent.
## The token is saved so players stay logged in between visits.
## Every game action goes through here; the server is the only source of truth.
extends Node

signal logged_in
signal logged_out
signal state_changed(state: Dictionary)

const SAVE_PATH := "user://session.cfg"

var token: String = ""
## Last state from the server (see server/app/lib/state.php).
var state: Dictionary = {}
## Server build from the last ping or state (shown in the footer to confirm deploys).
var server_build: String = "?"
## Server clock minus local clock, so countdowns match the server.
var server_offset: int = 0


func _ready() -> void:
	_load_token()


func has_token() -> bool:
	return token != ""


func has_profession() -> bool:
	return state.get("profession") != null and not state.is_empty()


## Current server time, estimated from the last response.
func now() -> int:
	return int(Time.get_unix_time_from_system()) + server_offset


func ping() -> Dictionary:
	var response := await Api.call_action("ping")
	if response["ok"]:
		server_build = str(response["data"].get("build", "?"))
	return response


func register(player_name: String, password: String) -> Dictionary:
	return await _authenticate("register", player_name, password)


func login(player_name: String, password: String) -> Dictionary:
	return await _authenticate("login", player_name, password)


func logout() -> void:
	if has_token():
		await Api.call_action("logout", {})
	_clear()
	logged_out.emit()


func refresh() -> Dictionary:
	return await _state_call("get_state", null)


# ---------------------------------------------------------------- game actions

func professions() -> Dictionary:
	return await _call("professions", null)


func choose_profession(profession_id: String) -> Dictionary:
	return await _state_call("choose_profession", {"profession_id": profession_id})


func collect_station() -> Dictionary:
	return await _state_call("collect_station", {}, "state")


func start_craft(recipe_id: String, quantity: int) -> Dictionary:
	return await _state_call("start_craft", {"recipe_id": recipe_id, "quantity": quantity})


func collect_crafts() -> Dictionary:
	return await _state_call("collect_crafts", {}, "state")


func market() -> Dictionary:
	return await _call("market", null)


func market_item(item_id: String) -> Dictionary:
	return await _call("market_item", {"item_id": item_id})


func sell_quote(item_id: String, quantity: int) -> Dictionary:
	return await _call("sell_quote", {"item_id": item_id, "quantity": quantity})


func list_item(item_id: String, quantity: int, unit_price: int, hours: int) -> Dictionary:
	return await _state_call("list_item", {"item_id": item_id, "quantity": quantity, "unit_price": unit_price, "duration_hours": hours}, "state")


func buy_listing(listing_id: int, quantity: int) -> Dictionary:
	return await _state_call("buy_listing", {"listing_id": listing_id, "quantity": quantity}, "state")


func cancel_listing(listing_id: int) -> Dictionary:
	return await _state_call("cancel_listing", {"listing_id": listing_id}, "state")


func my_listings() -> Dictionary:
	return await _call("my_listings", null)


## Instant sale to the guild. expected_total = the total the player was shown; the server refuses if it dropped.
func sell_to_guild(item_id: String, quantity: int, expected_total: int) -> Dictionary:
	return await _state_call("sell_to_guild", {"item_id": item_id, "quantity": quantity, "expected_total": expected_total}, "state")


func send_feedback(message: String, screen: String) -> Dictionary:
	return await _call("feedback", {"message": message, "screen": screen})


## City tab (#31): every player, sorted by "wealth" (gold) or "mastery" (crafts made).
func players(sort: String) -> Dictionary:
	return await _call("players", {"sort": sort})


func player_profile(player_id: int) -> Dictionary:
	return await _call("player_profile", {"player_id": player_id})


## Direct trades (#32). Item lists are [{"item_id": ..., "quantity": n}].
func trade_offers() -> Dictionary:
	return await _call("trade_offers", null)


func offer_create(to_player_id: int, give_items: Array, give_gold: int, ask_items: Array, ask_gold: int, note: String) -> Dictionary:
	return await _state_call("offer_create", {"to_player_id": to_player_id, "give_items": give_items, "give_gold": give_gold,
		"ask_items": ask_items, "ask_gold": ask_gold, "note": note}, "state")


func offer_accept(offer_id: int) -> Dictionary:
	return await _state_call("offer_accept", {"offer_id": offer_id}, "state")


func offer_decline(offer_id: int) -> Dictionary:
	return await _state_call("offer_decline", {"offer_id": offer_id}, "state")


func offer_cancel(offer_id: int) -> Dictionary:
	return await _state_call("offer_cancel", {"offer_id": offer_id}, "state")


# ---------------------------------------------------------------- internals

## Call an action; log out locally if the session is no longer valid.
func _call(action: String, body: Variant) -> Dictionary:
	var response := await Api.call_action(action, body)
	if not response["ok"] and response.get("status", 0) == 401 and has_token():
		_clear()
		logged_out.emit()
	return response


## Call an action that returns the player's state (directly, or under data[state_key]).
func _state_call(action: String, body: Variant, state_key := "") -> Dictionary:
	var response := await _call(action, body)
	if response["ok"]:
		var data: Dictionary = response["data"]
		_set_state(data[state_key] if state_key != "" else data)
	return response


func _authenticate(action: String, player_name: String, password: String) -> Dictionary:
	var response := await Api.call_action(action, {"name": player_name, "password": password})
	if response["ok"]:
		token = str(response["data"]["token"])
		_save_token()
		_set_state(response["data"]["state"])
		logged_in.emit()
	return response


func _set_state(new_state: Dictionary) -> void:
	state = new_state
	server_build = str(state.get("build", server_build))
	if state.has("server_time"):
		server_offset = int(state["server_time"]) - int(Time.get_unix_time_from_system())
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
