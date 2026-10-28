// The market ticker (#45) and news board (#46): price versus usual with a green/red arrow, a small
// sparkline of recent prices, and the news that explains why prices move.
import { duration } from '../format'
import type { NewsItem } from '../types'

/** "▲ +20%" (green, above usual: good time to sell) or "▼ −12%" (red, below usual: good time to buy). */
export function Trend({ pct, hot = false }: { pct: number; hot?: boolean }) {
  if (pct === 0) return <span class="muted num small">±0%</span>
  const up = pct > 0
  return (
    <span class={`num small ${up ? 'up' : 'down'}`} title={up ? 'Above its usual price: a good time to sell' : 'Below its usual price: a good time to buy'}>
      {up ? '▲' : '▼'} {up ? '+' : '−'}{Math.abs(pct)}%{hot ? ' 🔥' : ''}
    </span>
  )
}

/** A tiny line chart of recent prices, with a dotted line at the usual price. */
export function Sparkline({ points, usual, width = 80, height = 24 }: { points: number[]; usual: number; width?: number; height?: number }) {
  if (points.length < 2) return <span class="spark-empty muted tiny">no history yet</span>
  const lo = Math.min(...points, usual)
  const hi = Math.max(...points, usual)
  const span = hi - lo || 1
  const x = (i: number) => (i / (points.length - 1)) * (width - 2) + 1
  const y = (v: number) => height - 1 - ((v - lo) / span) * (height - 2)
  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const last = points[points.length - 1]
  return (
    <svg class="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`Price trend, now ${last >= usual ? 'above' : 'below'} usual`}>
      <line x1="0" x2={width} y1={y(usual)} y2={y(usual)} class="spark-usual" />
      <path d={path} class={last >= usual ? 'spark-up' : 'spark-down'} fill="none" />
    </svg>
  )
}

/** The news board: today's Guild Week day, then events that are coming or running. */
export function NewsBoard({ news }: { news: NewsItem[] }) {
  if (!news.length) return null
  return (
    <section class="card news" data-testid="news">
      <h2>City news</h2>
      {news.map((n) => (
        <div class="stack tight">
          <div class="row">
            <span class="grow accent">{n.title}</span>
            <span class="tiny muted">
              {n.status === 'today' ? 'today' : n.status === 'now' ? `ends in ${duration(n.seconds ?? 0)}` : `starts in ${duration(n.seconds ?? 0)}`}
            </span>
          </div>
          <p class="small">{n.headline}</p>
        </div>
      ))}
    </section>
  )
}
