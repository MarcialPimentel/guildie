// Root of the game: login -> choose a profession -> the game screen.
import { useEffect, useState } from 'preact/hooks'
import { errorMessage } from '../api'
import { useSession } from '../session'
import { GameScreen } from './GameScreen'
import { Login } from './Login'
import { ProfessionChoice } from './Profession'

export function App() {
  const s = useSession()
  const [booting, setBooting] = useState(s.loggedIn)
  const [bootError, setBootError] = useState('')

  // A saved token: load the player's state before showing anything.
  useEffect(() => {
    if (!s.loggedIn) return
    s.refresh().then((r) => {
      // On 401 the session logs out by itself and the login screen shows.
      if (!r.ok && r.status !== 401) setBootError(errorMessage(r))
      setBooting(false)
    })
  }, [])

  if (booting) return <p class="boot">Opening the guild hall…</p>
  if (!s.loggedIn || !s.state) return <Login initialError={bootError} />
  if (!s.state.profession) return <ProfessionChoice />
  return <GameScreen />
}
