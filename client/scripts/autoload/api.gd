## Talks to the Guildie PHP API (GDD 11.4).
## The server is authoritative: this only sends requests and returns what the server says.
##
## Every call returns a Dictionary:
##   success: {"ok": true,  "data": {...}, "status": 200}
##   failure: {"ok": false, "error": {"code": "...", "message": "..."}, "status": 4xx/5xx or 0}
extends Node

const TIMEOUT_SECONDS := 20.0

var base_url: String = ""


func _ready() -> void:
	base_url = _resolve_base_url()


func _resolve_base_url() -> String:
	# In the browser, the API lives next to the game page: .../games/guildie/api/index.php
	if OS.has_feature("web"):
		var url = JavaScriptBridge.eval("new URL('api/index.php', window.location.href).href", true)
		if typeof(url) == TYPE_STRING and url != "":
			return url
	var override := OS.get_environment("GUILDIE_API_URL")
	if override != "":
		return override
	return BuildInfo.DEFAULT_API_URL


## Call an API action. Pass a body Dictionary for POST, or null for GET.
func call_action(action: String, body: Variant = null) -> Dictionary:
	var http := HTTPRequest.new()
	http.timeout = TIMEOUT_SECONDS
	add_child(http)

	var headers := PackedStringArray(["Content-Type: application/json", "Accept: application/json"])
	if Session.token != "":
		headers.append("X-Guildie-Token: " + Session.token)

	var url := "%s?action=%s" % [base_url, action.uri_encode()]
	var method := HTTPClient.METHOD_GET if body == null else HTTPClient.METHOD_POST
	var payload := "" if body == null else JSON.stringify(body)

	if http.request(url, headers, method, payload) != OK:
		http.queue_free()
		return _failure("network_error", "Could not reach the server.", 0)

	var completed: Array = await http.request_completed
	http.queue_free()

	var result: int = completed[0]
	var status: int = completed[1]
	var raw: PackedByteArray = completed[3]

	if result != HTTPRequest.RESULT_SUCCESS:
		return _failure("network_error", "Could not reach the server. Check your connection.", status)

	var parsed: Variant = JSON.parse_string(raw.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY:
		return _failure("bad_response", "The server sent an unexpected response.", status)

	if parsed.get("ok", false):
		return {"ok": true, "data": parsed.get("data", {}), "status": status}
	return {"ok": false, "error": parsed.get("error", {"code": "unknown", "message": "Unknown error."}), "status": status}


func _failure(code: String, message: String, status: int) -> Dictionary:
	return {"ok": false, "error": {"code": code, "message": message}, "status": status}


## Human-readable message from a failed call.
static func error_message(response: Dictionary) -> String:
	return str(response.get("error", {}).get("message", "Something went wrong."))
