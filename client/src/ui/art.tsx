// The Portovela look (docs/art-direction.md): item icons on majolica tiles, and ducat amounts with a coin.
import { number } from '../format'

// Every icon in src/icons/, by item id (e.g. "healing_draught"). Vite turns each into a URL (small ones inline).
const ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('../icons/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
    .map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]),
)

/** An item's icon on its tile. Items without an icon yet get a plain tile, so rows stay aligned. */
export function ItemIcon({ id, big = false }: { id: string; big?: boolean }) {
  const url = ICONS[id]
  return (
    <span class={`tile${big ? ' big' : ''}${url ? '' : ' blank'}`} aria-hidden="true">
      {url && <img src={url} alt="" loading="lazy" />}
    </span>
  )
}

/** "1,250" with a ducat coin. The hidden word makes it read "1,250 ducats" (and keeps tests readable). */
export function Coins({ n, testid }: { n: number; testid?: string }) {
  return (
    <span class="coins" data-testid={testid}>
      {number(n)}<i class="coin" aria-hidden="true" /><span class="sr"> {Math.trunc(n) === 1 ? 'ducat' : 'ducats'}</span>
    </span>
  )
}
