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

/** A recipe's colour at your skill (#30): XP falls off as it gets easy. */
export type Colour = 'orange' | 'yellow' | 'green' | 'grey'

export interface Recipe {
  id: string
  name: string
  output: { item_id: string; quantity: number }
  value: number
  inputs: RecipeInput[]
  seconds_each: number
  can_make: number
  skill: number
  colour: Colour
  xp_each: number
  trade_bonus: boolean
  rare: boolean
  discovered: boolean
}

/** Skill and rank (#30), from state.profession.progress. */
export interface Progress {
  skill: number
  max_skill: number
  xp: number
  xp_needed: number
  rank: string
  rank_id: string
  next_rank: { name: string; at: number } | null
  first_craft_bonus: boolean
  /** The highest skill your bottega allows (0.11.0, #51): build the next upgrade to go past it. */
  cap: number
  /** At the cap: crafts and orders give no XP until the next upgrade is built. */
  at_cap: boolean
}

/** Your bottega and its next upgrade (0.11.0, #51, docs/palazzo.md §2). */
export interface Workshop {
  level: number
  max_level: number
  /** The current workbench's name ("Bellows forge"), or the level's look at level 1. */
  name: string
  /** How the building looks: "Rundown shack" .. "Fine bottega". */
  look: string
  slots: number
  craft_speed: number
  skill_cap: number
  at_cap: boolean
  /** Holds a rank from before 0.11.0 that the building hasn't caught up with yet. */
  kept_rank: boolean
  building: null | { level: number; name: string; ready_at: number; seconds: number; ready: boolean }
  next: null | {
    level: number
    name: string
    look: string
    needs_skill: number
    /** The rank this upgrade opens (null if you already hold it). */
    opens_rank: string | null
    slots: number
    craft_speed: number
    station_cap: number
    station_rate: number
    cost: { gold: number; seconds: number; items: { item_id: string; name: string; quantity: number; have: number; guild: string }[] }
  }
}

/** What a collect or a filled order changed (#30, #49). */
export interface ProgressGain {
  xp: number
  skill_from: number
  skill_to: number
  rank_up: string | null
  learned: string[]
  unlocked: string[]
  doubled: boolean
  discoveries: string[]
  taught?: string | null
  /** Skill is at the bottega's cap (0.11.0): no more XP until the next upgrade. */
  capped?: boolean
}

/** A recipe at the guild trainer (#49). */
export interface TrainerRecipe {
  id: string
  name: string
  output: { item_id: string; name: string; quantity: number }
  inputs: { item_id: string; name: string; quantity: number; guild: string | null }[]
  imports_from: string[]
  skill: number
  rank: string
  rare: boolean
  starter: boolean
  price: number
  status: 'known' | 'learn' | 'locked' | 'rare'
  colour: Colour
  xp_each: number
  value: number
  seconds_each: number
}

export interface Trainer {
  trainer: string
  skill: number
  gold: number
  recipes: TrainerRecipe[]
}

export interface CraftJob {
  id: number
  recipe_id: string
  item_id?: string
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
  /** On 'sold' entries (0.10.0): who bought (an economy.json persona id, or 'player') and what you earned. */
  sale?: { buyer: string; item_id: string; quantity: number; earned: number }
}

export interface GameState {
  player: { id: number; name: string; gold: number }
  profession: null | {
    id: string
    name: string
    tagline: string
    station: { id: string; name: string; outputs: StationOutput[]; locked?: { item_id: string; name: string; unlock_skill: number }[] }
    recipes: Recipe[]
    progress: Progress
    workshop: Workshop
  }
  inventory: InventoryItem[]
  crafts: CraftJob[]
  craft_slots: number
  max_batch: number
  active_listings: number
  incoming_offers: number
  /** The new-player guide (0.14.0): finished for everyone who joined before it. */
  guide?: GuideStatus
  activity: Activity[]
  server_time: number
  build: string
}

/** The new-player guide (0.14.0, content/guide.json): the current step, or finished. */
export type GuideStatus =
  | { finished: true }
  | {
      finished: false
      index: number
      total: number
      final_reward: number
      step: { id: string; title: string; hint: string; reward: number; target: string | null; optional: boolean; ready: boolean }
    }

export interface GuideClaim { step: string; gold: number; final: number; finished: boolean; guide: GuideStatus }

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
  /** content/orders.json id: picks the customer's look in the 3D harbor (0.10.0). */
  customer_id: string
  line: string
  arriving_in: number
  seconds_left: number
  items: OrderLine[]
  reward_gold: number
  reward_items: { item_id: string; name: string; quantity: number }[]
  reward_xp: number
  reward_recipe: { id: string; name: string; output: string; quantity: number; skill: number } | null
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
  skill: number
  rank_name: string
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
  skill: number
  rank_name: string
  recipes_known: number
  recipes_total: number
  seen_ago: number | null
  me: boolean
  title: string | null
  can_trade: boolean
  listings: { id: number; item_id: string; name: string; quantity: number; unit_price: number }[]
  /** 0.9.0 */
  friend?: boolean
  profession_id?: string
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

// ---------------------------------------------------------------- the living city (0.9.0)

export interface PresenceMe {
  id: number
  name: string
  profession: string
  /** Body color 0-5, hat 0-2, rank 0-3 (0.10.0). look_chosen is false for accounts that never chose. */
  look: number
  hat: number
  rank: number
  look_chosen: boolean
  slaps: boolean
}

export interface PresencePass {
  enabled: boolean
  url?: string
  token?: string
  expires_in?: number
  me: PresenceMe
}

export interface StallCard {
  id: number
  name: string
  profession_id: string
  profession: string
  look: number
  hat: number
  rank: number
  /** Their bottega level 1-4 (0.11.0): a shack to a fine bottega. */
  level: number
  me: boolean
  friend: boolean
  seen_ago: number | null
  listing_count: number
  listings: { id: number; item_id: string; name: string; quantity: number; unit_price: number }[]
  echo: { text: string; ago: number } | null
}

export interface Friends {
  friends: StallCard[]
}

export interface DukeLine {
  item_id: string
  name: string
  guild: string
  goal: number
  delivered: number
  have: number
  mine: number
  can_give: number
  unit_pay: number
  unit_bonus: number
}

export interface DukeBoard {
  id: number
  title: string
  line: string
  status: 'open' | 'fulfilled' | 'expired'
  seconds_left: number
  share_open_in: number
  max_share: number
  lines: DukeLine[]
  helpers: { player_id: number; name: string; value: number; items: number; me: boolean }[]
  helper_count: number
  my_rank: number | null
  my_paid: number
  my_bonus: number
}

// ---------------------------------------------------------------- the Palazzo (0.11.0, docs/palazzo.md)

export interface WantedPost {
  id: number
  player_id: number
  player: string
  profession: string
  item_id: string
  name: string
  /** The guild that makes it. */
  guild: string
  quantity: number
  remaining: number
  unit_price: number
  status: 'open' | 'filled' | 'cancelled' | 'expired'
  expires_in: number
  mine: boolean
  /** How many you have in your storehouse. */
  have: number
}

export interface WantedBoard {
  posts: WantedPost[]
  mine: WantedPost[]
  /** The fair price band per item: what a post may offer per unit. */
  bands: Record<string, { min: number; max: number; usual: number }>
  max_open: number
  hours: number
  cut: number
  gold: number
}

export interface HonorRow { id: number; name: string; profession: string; value: string; me: boolean }

/** The Factotum's merchant (0.13.0): the statue in the Palazzo and the portrait over the hall door. */
export interface FactotumRow extends HonorRow {
  look: { profession_id: string; color: number; hat: number; rank: number } | null
}

export interface Honors {
  title: string
  factotum: FactotumRow | null
  boards: { id: string; title: string; rows: HonorRow[] }[]
}

export interface PalazzoNpc { id: string; name: string; title: string; character: string; favor_done: boolean }

export interface NpcTalk {
  id: string
  name: string
  title: string
  character: string
  line: string
  rumor: string
  favor: null | { item_id: string; name: string; quantity: number; reward: number; xp: number; done: boolean; have: number; line: string }
  resets_in: number
}
