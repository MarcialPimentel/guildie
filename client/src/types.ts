// Shapes of what the PHP API sends (see server/app/lib/state.php and the actions in router.php).
// The client only displays these; the server decides everything.

export interface StationOutput {
  item_id: string
  name: string
  ready: number
  cap: number
  rate_per_hour: number
  seconds_to_full: number
}

export interface RecipeInput {
  item_id: string
  name: string
  quantity: number
  have: number
  from_other_profession: boolean
}

export interface Recipe {
  id: string
  name: string
  value: number
  inputs: RecipeInput[]
  seconds_each: number
  can_make: number
}

export interface CraftJob {
  id: number
  recipe_id: string
  name: string
  quantity: number
  ends_at: number
  done: boolean
}

export interface InventoryItem {
  item_id: string
  name: string
  type: string
  quality: number
  quantity: number
  reference: number
}

export interface Activity {
  id: number
  type: string
  text: string
  created_at: number
}

export interface GameState {
  player: { id: number; name: string; gold: number }
  profession: null | {
    id: string
    name: string
    tagline: string
    station: { id: string; name: string; outputs: StationOutput[] }
    recipes: Recipe[]
  }
  inventory: InventoryItem[]
  crafts: CraftJob[]
  craft_slots: number
  max_batch: number
  active_listings: number
  incoming_offers: number
  activity: Activity[]
  server_time: number
  build: string
}

export interface ProfessionChoice {
  id: string
  name: string
  tagline: string
  description: string
  station: string
  gathers: string[]
  makes: string[]
  needs_from_others: string
}

/** Ticker fields (#45): usual value, % versus usual, a hot flag, and a price history (oldest first). */
export interface Ticker {
  usual: number
  change_pct: number
  hot: boolean
  spark: number[]
}

export interface NewsItem {
  kind: 'week' | 'event'
  title: string
  headline: string
  status: 'today' | 'now' | 'soon'
  seconds?: number
}

export interface Surprise {
  text: string
  item_id: string
  quantity: number
}

export interface OrderLine {
  item_id: string
  name: string
  quantity: number
  have: number
  own_guild: boolean
}

export interface Order {
  id: number
  slot: number
  kind: 'standard' | 'bundle' | 'collector'
  customer: string
  line: string
  arriving_in: number
  seconds_left: number
  items: OrderLine[]
  reward_gold: number
  reward_items: { item_id: string; name: string; quantity: number }[]
}

export interface OrderBoard {
  orders: Order[]
  skip_in: number
}

export interface MarketRow extends Ticker {
  item_id: string
  name: string
  type: string
  profession: string
  reference: number
  lowest: number | null
  listed: number
  from_players: number
}

export interface Listing {
  id: number
  seller: string
  is_npc: boolean
  mine: boolean
  quantity: number
  unit_price: number
}

export interface Trade {
  quantity: number
  unit_price: number
  buyer: string
  seller: string
  ago: number
}

export interface MarketItem extends Ticker {
  item_id: string
  name: string
  description: string
  reference: number
  floor: number
  trader_price: number
  ceiling: number
  you_have: number
  listings: Listing[]
  trades: Trade[]
}

export interface GuildQuote {
  quantity: number
  total: number
  first_unit: number
  last_unit: number
  hint: string | null
}

export interface SellQuote {
  item_id: string
  name: string
  type: string
  you_have: number
  reference: number
  lowest_player: number | null
  trader_price: number
  ceiling: number
  deposits: Record<string, number>
  cut_percent: number
  guild: GuildQuote
}

export interface MyListing {
  id: number
  item_id: string
  name: string
  quantity: number
  sold: number
  original: number
  unit_price: number
  status: string
  seconds_left: number
}

export interface DirectoryPlayer {
  id: number
  name: string
  profession: string
  gold: number
  crafted: number
  seen_ago: number | null
  me: boolean
  rank: number
  title: string | null
}

export interface Directory {
  sort: 'wealth' | 'mastery'
  total: number
  players: DirectoryPlayer[]
  me: DirectoryPlayer | null
}

export interface Profile {
  id: number
  name: string
  profession: string
  gold: number
  crafted: number
  recipes_known: number
  recipes_total: number
  seen_ago: number | null
  me: boolean
  title: string | null
  can_trade: boolean
  listings: { id: number; item_id: string; name: string; quantity: number; unit_price: number }[]
}

export interface Offer {
  id: number
  incoming: boolean
  other: string
  you_get: string
  you_give: string
  note: string
  status: string
  seconds_left: number
}

export interface Offers {
  incoming: Offer[]
  outgoing: Offer[]
  closed: Offer[]
}

export interface ItemCount {
  item_id: string
  quantity: number
}
