## Workshop: the 30-second check-in screen (GDD 4.1). Collect from the station, collect crafts, queue new crafts
## (the recipes, #39), and see what happened, all on one screen.
extends Control

const RecipesPanel := preload("res://scripts/ui/recipes_panel.gd")

var game: Node

var _col: VBoxContainer
var _station_box: VBoxContainer
var _crafts_box: VBoxContainer
var _activity_box: VBoxContainer
var _recipes: VBoxContainer
var _countdowns: Array = []   # [Label, ends_at, prefix]
var _station_counts: Array = []   # [Label, ready_at_fetch, cap, rate_per_hour, fetched_at]
var _collect_station: Button


func _ready() -> void:
	_col = UI.scroll_column(self)
	_station_box = UI.card(_col)
	_crafts_box = UI.card(_col)
	_recipes = RecipesPanel.new()
	_recipes.name = "Recipes"
	_recipes.set("game", game)
	_col.add_child(_recipes)
	_col.add_child(UI.label("Recent activity", 20, UI.BRASS))
	_activity_box = VBoxContainer.new()
	_activity_box.add_theme_constant_override("separation", 6)
	_col.add_child(_activity_box)
	_col.add_child(UI.spacer(8))
	var footer := UI.label(UI.build_text(), 13, UI.MUTED, HORIZONTAL_ALIGNMENT_CENTER)
	footer.name = "Footer"
	_col.add_child(footer)
	var logout := UI.button("Log out", true, true)
	logout.pressed.connect(func(): Session.logout())
	_col.add_child(logout)
	game.second.connect(_tick)


func render() -> void:
	var state := Session.state
	if state.is_empty() or state.get("profession") == null:
		return
	_countdowns.clear()
	_station_counts.clear()
	_render_station(state["profession"]["station"])
	_render_crafts(state)
	_recipes.call("render")
	_render_activity(state.get("activity", []))
	(_col.get_node("Footer") as Label).text = UI.build_text()


func on_background_refresh() -> void:
	pass   # render() already ran via state_changed


func _render_station(station: Dictionary) -> void:
	UI.clear(_station_box)
	_station_box.add_child(UI.label(station["name"], 24, UI.BRASS))
	var any_ready := false
	for out in station["outputs"]:
		var r := UI.row(_station_box)
		r.add_child(UI.expand(UI.label(out["name"])))
		var full: bool = int(out["ready"]) >= int(out["cap"])
		var count := UI.value("%d / %d" % [out["ready"], out["cap"]], 20, UI.ERROR if full else UI.BRASS)
		r.add_child(count)
		_station_counts.append([count, int(out["ready"]), int(out["cap"]), float(out["rate_per_hour"]), Session.now()])
		var note := UI.label("", 15, UI.MUTED)
		if full:
			note.text = "Full: production is paused until you collect."
			note.add_theme_color_override("font_color", UI.ERROR)
		else:
			_countdowns.append([note, Session.now() + int(out["seconds_to_full"]), "%s/hour · full in " % _num(out["rate_per_hour"])])
		_station_box.add_child(note)
		any_ready = any_ready or int(out["ready"]) > 0
	var b := UI.button("Collect")
	b.disabled = not any_ready
	b.pressed.connect(func(): game.run(b, Session.collect_station, "Collected."))
	_station_box.add_child(b)
	_collect_station = b


func _render_crafts(state: Dictionary) -> void:
	UI.clear(_crafts_box)
	var crafts: Array = state.get("crafts", [])
	var slots := int(state.get("craft_slots", 1))
	var header := UI.row(_crafts_box)
	header.add_child(UI.expand(UI.label("Crafting", 24, UI.BRASS)))
	header.add_child(UI.value("%d / %d slots" % [crafts.size(), slots], 18, UI.MUTED))

	if crafts.is_empty():
		_crafts_box.add_child(UI.label("Nothing crafting. Pick a recipe below.", 17, UI.MUTED))
	var any_done := false
	for job in crafts:
		var r := UI.row(_crafts_box)
		r.add_child(UI.expand(UI.label("%s ×%d" % [job["name"], job["quantity"]])))
		var t := UI.value("", 18, UI.OK_GREEN)
		r.add_child(t)
		_countdowns.append([t, int(job["ends_at"]), ""])
		any_done = any_done or job["done"]
	if not crafts.is_empty():
		var b := UI.button("Collect finished crafts")
		b.name = "CollectCrafts"
		b.disabled = not any_done
		b.pressed.connect(func(): game.run(b, Session.collect_crafts, "Crafts collected."))
		_crafts_box.add_child(b)
	_tick()


func _render_activity(activity: Array) -> void:
	UI.clear(_activity_box)
	if activity.is_empty():
		_activity_box.add_child(UI.label("Nothing yet.", 16, UI.MUTED))
	for a in activity.slice(0, 12):
		var r := UI.row(_activity_box, 8)
		var color := UI.OK_GREEN if a["type"] == "sold" else UI.CREAM
		r.add_child(UI.expand(UI.label(a["text"], 16, color)))
		r.add_child(UI.value(_ago(Session.now() - int(a["created_at"])), 14, UI.MUTED))


func _tick() -> void:
	var now := Session.now()
	# Estimate station counts between server refreshes (the server stays authoritative on collect).
	for c in _station_counts:
		var lbl: Label = c[0]
		if not is_instance_valid(lbl):
			continue
		var estimate: int = min(int(c[2]), int(c[1]) + int(floor((now - int(c[4])) * float(c[3]) / 3600.0)))
		lbl.text = "%d / %d" % [estimate, c[2]]
		if estimate >= int(c[2]):
			lbl.add_theme_color_override("font_color", UI.ERROR)
		if estimate > 0 and is_instance_valid(_collect_station) and _collect_station.disabled and not game.get("_refreshing"):
			_collect_station.disabled = false
	var newly_done := false
	for c in _countdowns:
		var lbl: Label = c[0]
		if not is_instance_valid(lbl):
			continue
		var left := int(c[1]) - now
		if c[2] == "":
			lbl.text = "Ready!" if left <= 0 else UI.duration(left)
			newly_done = newly_done or left <= 0
		else:
			lbl.text = c[2] + ("now" if left <= 0 else UI.duration(left))
	var collect := _crafts_box.get_node_or_null("CollectCrafts") as Button
	if collect and newly_done and collect.disabled and not game.get("_refreshing"):
		collect.disabled = false


static func _ago(seconds: int) -> String:
	if seconds < 60:
		return "now"
	if seconds < 3600:
		return "%dm" % (seconds / 60)
	if seconds < 86400:
		return "%dh" % (seconds / 3600)
	return "%dd" % (seconds / 86400)


static func _num(v: Variant) -> String:
	var f := float(v)
	return str(int(f)) if is_equal_approx(f, round(f)) else "%.1f" % f
