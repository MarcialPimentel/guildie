import { render } from 'preact'
import { App } from './ui/App'
// Fonts are bundled with the game (no outside font server): Fraunces for headings, Nunito for text.
import '@fontsource-variable/fraunces/wght.css'
import '@fontsource/nunito/latin-400.css'
import '@fontsource/nunito/latin-600.css'
import '@fontsource/nunito/latin-700.css'
import '@fontsource/nunito/latin-800.css'
import './styles.css'

// Clear the "Opening the bottega…" placeholder from index.html first: Preact adds to the container
// rather than replacing what's there, so it stayed on screen above the game (0.6.0 fix).
const root = document.getElementById('app')!
root.replaceChildren()
render(<App />, root)
