// Things the panels tell the 3D world after the server has answered (0.10.0): an order filled or turned
// down, so the customer at your door can act it out. Kept free of three.js so the main bundle can use it.

export type WorldEvent =
  | { t: 'orderFilled'; order: number; text: string }
  | { t: 'orderTurnedDown'; order: number }

const listeners = new Set<(e: WorldEvent) => void>()

export const worldEvents = {
  emit(e: WorldEvent): void {
    for (const f of listeners) f(e)
  },
  on(f: (e: WorldEvent) => void): () => void {
    listeners.add(f)
    return () => { listeners.delete(f) }
  },
}
