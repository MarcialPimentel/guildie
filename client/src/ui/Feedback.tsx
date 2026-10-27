// Feedback pop-up (#29): a text box that sends a note to Marz with the build, screen and gold attached.
import { useEffect, useRef, useState } from 'preact/hooks'
import { errorMessage } from '../api'
import { session } from '../session'
import { useGame } from './common'

const MAX_CHARS = 1000

export function FeedbackDialog({ screen, onClose }: { screen: string; onClose: () => void }) {
  const game = useGame()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const send = async () => {
    const message = text.trim()
    if (!message) {
      setError('Write something first.')
      return
    }
    setBusy(true)
    setError('')
    const r = await session.sendFeedback(message, screen)
    setBusy(false)
    if (r.ok) {
      game.say('Thanks! Feedback sent.')
      onClose()
    } else {
      setError(errorMessage(r))
    }
  }

  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && onClose()} data-testid="feedback-dialog">
      <div class="card" role="dialog" aria-label="Send feedback">
        <h2>Send feedback</h2>
        <p class="muted small">
          What's fun, confusing, broken or boring? Marz reads every note. Your screen, gold and the build number are attached.
        </p>
        <textarea
          ref={box} value={text} placeholder="Type here…" onInput={(e) => setText(e.currentTarget.value)}
          data-testid="feedback-text"
        />
        <p class={`right tiny ${text.length > MAX_CHARS ? 'error' : 'muted'}`}>{text.length} / {MAX_CHARS}</p>
        {error && <p class="error small">{error}</p>}
        <div class="btnrow">
          <button class="secondary" onClick={onClose}>Cancel</button>
          <button onClick={send} disabled={busy} data-testid="feedback-send">Send</button>
        </div>
      </div>
    </div>
  )
}
