// The logged-in player's session and the latest state the server sent.
// The token is kept in localStorage so players stay logged in between visits.
// Every game action goes through here; the server is the only source of truth.
import { useEffect, useState } from 'preact/hooks'
import { callAction, setTokenProvider, type ApiResult } from './api'
import type {
  Activity, Directory, DukeBoard, Friends, GameState, ItemCount, MarketItem, MarketRow, MyListing, NewsItem, Offers, OrderBoard,
  PresencePass, Profile, ProfessionChoice, ProgressGain, SellQuote, Surprise, Trainer,
  Honors, NpcTalk, PalazzoNpc, WantedBoard,
} from './types'

const TOKEN_KEY = 'guildie.token'

function loadToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private mode or blocked storage: the player just logs in again next visit.
  }
}

type Listener = () => void

class Session {
  token = loadToken()
  state: GameState | null = null
  /** Server build from the last ping or state (shown in the footer to confirm deploys). */
  serverBuild = '?'
  /** Server clock minus local clock (seconds), so countdowns match the server. */
  offset = 0
  /** Bumped when you add or remove a friend, so the 3D city's stars update at once (0.9.0). */
  friendsVersion = 0
  private listeners = new Set<Listener>()

  constructor() {
    setTokenProvider(() => this.token)
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn())
  }

  get loggedIn(): boolean {
    return this.token !== ''
  }

  /** Current server time (Unix seconds), estimated from the last response. */
  now(): number {
    return Math.floor(Date.now() / 1000) + this.offset
  }

  // ------------------------------------------------------------ accounts

  async ping(): Promise<ApiResult<{ build: string }>> {
    const r = await callAction<{ build: string }>('ping')
    if (r.ok) {
      this.serverBuild = String(r.data.build ?? '?')
      this.emit()
    }
    return r
  }

  register(name: string, password: string) {
    return this.authenticate('register', name, password)
  }

  login(name: string, password: string) {
    return this.authenticate('login', name, password)
  }

  async logout(): Promise<void> {
    if (this.token) await callAction('logout', {})
    this.clear()
  }

  refresh() {
    return this.stateCall<GameState>('get_state')
  }

  // ------------------------------------------------------------ game actions

  professions() {
    return this.call<{ professions: ProfessionChoice[] }>('professions')
  }
  /** Join a guild, with the look picked on the same screen (0.10.0). */
  chooseProfession(professionId: string, look?: { color: number; hat: number }) {
    return this.stateCall<GameState>('choose_profession', { profession_id: professionId, ...(look ? { look_color: look.color, look_hat: look.hat } : {}) })
  }
  collectStation() {
    return this.stateCall<{ surprises?: Surprise[] }>('collect_station', {}, 'state')
  }
  startCraft(recipeId: string, quantity: number) {
    return this.stateCall<GameState>('start_craft', { recipe_id: recipeId, quantity })
  }
  collectCrafts() {
    return this.stateCall<{ surprises?: Surprise[]; progress?: ProgressGain | null }>('collect_crafts', {}, 'state')
  }
  /** The guild trainer (#49): every recipe of your guild, what it needs, and what it costs. */
  trainer() {
    return this.call<Trainer>('trainer')
  }
  learnRecipe(recipeId: string) {
    return this.stateCall<{ learned: { name: string; price: number }; trainer: Trainer }>('learn_recipe', { recipe_id: recipeId }, 'state')
  }
  market() {
    return this.call<{ items: MarketRow[]; news: NewsItem[] }>('market')
  }
  marketItem(itemId: string) {
    return this.call<MarketItem>('market_item', { item_id: itemId })
  }
  sellQuote(itemId: string, quantity: number) {
    return this.call<SellQuote>('sell_quote', { item_id: itemId, quantity })
  }
  listItem(itemId: string, quantity: number, unitPrice: number, hours: number) {
    return this.stateCall('list_item', { item_id: itemId, quantity, unit_price: unitPrice, duration_hours: hours }, 'state')
  }
  buyListing(listingId: number, quantity: number) {
    return this.stateCall('buy_listing', { listing_id: listingId, quantity }, 'state')
  }
  cancelListing(listingId: number) {
    return this.stateCall('cancel_listing', { listing_id: listingId }, 'state')
  }
  myListings() {
    return this.call<{ listings: MyListing[] }>('my_listings')
  }
  /** Instant sale to the guild. expectedTotal = the total shown; the server refuses if the offer dropped. */
  sellToGuild(itemId: string, quantity: number, expectedTotal: number) {
    return this.stateCall<{ sale: { total: number } }>('sell_to_guild', { item_id: itemId, quantity, expected_total: expectedTotal }, 'state')
  }
  sendFeedback(message: string, screen: string) {
    return this.call<{ saved: boolean }>('feedback', { message, screen })
  }
  players(sort: 'wealth' | 'mastery') {
    return this.call<Directory>('players', { sort })
  }
  playerProfile(playerId: number) {
    return this.call<Profile>('player_profile', { player_id: playerId })
  }
  tradeOffers() {
    return this.call<Offers>('trade_offers')
  }
  offerCreate(to: number, give: ItemCount[], giveGold: number, ask: ItemCount[], askGold: number, note: string) {
    return this.stateCall('offer_create', {
      to_player_id: to, give_items: give, give_gold: giveGold, ask_items: ask, ask_gold: askGold, note,
    }, 'state')
  }
  /** The Workshop order board (#44). */
  orders() {
    return this.call<OrderBoard>('orders')
  }
  orderFill(orderId: number) {
    return this.stateCall<{ filled: { customer: string; reward_text: string; progress?: ProgressGain }; board: OrderBoard }>('order_fill', { order_id: orderId }, 'state')
  }
  orderSkip(orderId: number) {
    return this.stateCall<{ board: OrderBoard }>('order_skip', { order_id: orderId }, 'state')
  }
  /** What happened since a time (the "While you were away" screen, #47). */
  activitySince(since: number) {
    return this.call<{ activity: Activity[] }>('activity', undefined, { since })
  }
  news() {
    return this.call<{ news: NewsItem[] }>('news')
  }
  // ---- the living city (0.9.0)
  /** A signed pass for the realtime room (enabled: false when presence isn't set up). */
  presenceToken() {
    return this.call<PresencePass>('presence_token')
  }
  cityPrefs(slaps: boolean) {
    return this.call<{ slaps: boolean }>('city_prefs', { slaps })
  }
  /** Choose your merchant's body color and hat (0.10.0). */
  cityLook(color: number, hat: number) {
    return this.call<{ color: number; hat: number; chosen: boolean; rank: number }>('city_look', { color, hat })
  }
  friends() {
    return this.call<Friends>('friends')
  }
  friendAdd(playerId: number) {
    return this.friendsCall('friend_add', playerId)
  }
  friendRemove(playerId: number) {
    return this.friendsCall('friend_remove', playerId)
  }
  private async friendsCall(action: string, playerId: number) {
    const r = await this.call<Friends>(action, { player_id: playerId })
    if (r.ok) {
      this.friendsVersion++
      this.emit()
    }
    return r
  }
  dukeOrder() {
    return this.call<DukeBoard>('duke_order')
  }
  dukeContribute(itemId: string, quantity: number) {
    return this.stateCall<{ given: { name: string; quantity: number; paid: number; fulfilled: boolean }; board: DukeBoard }>(
      'duke_contribute', { item_id: itemId, quantity }, 'state')
  }

  // ------------------------------------------------------------ the bottega upgrades and the Palazzo (0.11.0)
  workshopUpgrade() {
    return this.stateCall<{ started: { level: number; name: string; seconds: number } }>('workshop_upgrade', {}, 'state')
  }
  workshopOpen() {
    return this.stateCall<{ built: { level: number; name: string; look: string; progress: ProgressGain | null } }>('workshop_open', {}, 'state')
  }
  palazzo() {
    return this.call<{ npcs: PalazzoNpc[] }>('palazzo')
  }
  honors() {
    return this.call<Honors>('honors')
  }
  npcTalk(npc: string) {
    return this.call<NpcTalk>('npc_talk', { npc })
  }
  npcFavor(npc: string) {
    return this.stateCall<{ done: { npc: string; quantity: number; reward: number; progress: ProgressGain }; talk: NpcTalk }>('npc_favor', { npc }, 'state')
  }
  wanted() {
    return this.call<WantedBoard>('wanted')
  }
  wantedPost(itemId: string, quantity: number, unitPrice: number) {
    return this.stateCall<{ posted: { id: number; held: number }; board: WantedBoard }>('wanted_post', { item_id: itemId, quantity, unit_price: unitPrice }, 'state')
  }
  wantedFill(postId: number, quantity: number) {
    return this.stateCall<{ filled: { name: string; quantity: number; earned: number; cut: number; done: boolean }; board: WantedBoard }>('wanted_fill', { post_id: postId, quantity }, 'state')
  }
  wantedCancel(postId: number) {
    return this.stateCall<{ cancelled: { refund: number }; board: WantedBoard }>('wanted_cancel', { post_id: postId }, 'state')
  }
  offerAccept(offerId: number) {
    return this.stateCall('offer_accept', { offer_id: offerId }, 'state')
  }
  offerDecline(offerId: number) {
    return this.stateCall('offer_decline', { offer_id: offerId }, 'state')
  }
  offerCancel(offerId: number) {
    return this.stateCall('offer_cancel', { offer_id: offerId }, 'state')
  }

  // ------------------------------------------------------------ internals

  /** Call an action; log out locally if the session is no longer valid. */
  private async call<T>(action: string, body?: unknown, query: Record<string, string | number> = {}): Promise<ApiResult<T>> {
    const r = await callAction<T>(action, body, query)
    if (!r.ok && r.status === 401 && this.token) this.clear()
    return r
  }

  /** Call an action that returns the player's state (directly, or under data[stateKey]). */
  private async stateCall<T = Record<string, unknown>>(action: string, body?: unknown, stateKey = ''): Promise<ApiResult<T>> {
    const r = await this.call<T>(action, body)
    if (r.ok) {
      const data = r.data as unknown as Record<string, unknown>
      this.setState((stateKey ? data[stateKey] : data) as GameState)
    }
    return r
  }

  private async authenticate(action: string, name: string, password: string) {
    const r = await callAction<{ token: string; state: GameState }>(action, { name, password })
    if (r.ok) {
      this.token = String(r.data.token)
      saveToken(this.token)
      this.setState(r.data.state)
    }
    return r
  }

  private setState(state: GameState): void {
    this.state = state
    this.serverBuild = String(state.build ?? this.serverBuild)
    if (state.server_time) this.offset = state.server_time - Math.floor(Date.now() / 1000)
    this.emit()
  }

  private clear(): void {
    this.token = ''
    this.state = null
    saveToken('')
    this.emit()
  }
}

export const session = new Session()

/** Re-render a component whenever the session changes (new state, login, logout). */
export function useSession(): Session {
  const [, setVersion] = useState(0)
  useEffect(() => session.subscribe(() => setVersion((n) => n + 1)), [])
  return session
}
