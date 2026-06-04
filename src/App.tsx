import { useState } from 'react'
import './App.css'
import NeboGame from './games/nebo/NeboGame.tsx'

type Screen = 'home' | 'nebo' | 'hitster'

function App() {
  const [screen, setScreen] = useState<Screen>('home')

  if (screen === 'nebo') {
    return <NeboGame onBack={() => setScreen('home')} />
  }

  if (screen === 'hitster') {
    return (
      <main className="page">
        <section className="card hero">
          <button className="backButton" onClick={() => setScreen('home')}>
            ← Zurück zur Spielekiste
          </button>

          <p className="eyebrow">Lokales Hotseat-Spiel</p>
          <h1>Trackline 🎵</h1>
          <p className="subtitle">
            Hier entsteht später euer lokales Musik-Zeitlinien-Spiel.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="page gamesHubPage">
      <section className="gamesHub">
        <p className="eyebrow">Willkommen in der</p>
        <h1>Spielekiste 🎲</h1>
        <p className="subtitle">
          Wähle ein Spiel aus und leg direkt los.
        </p>

        <div className="gamesGrid">
          <button
            className="gameTile"
            onClick={() => setScreen('nebo')}
          >
            <span className="gameTileIcon">🃏</span>
            <span className="gameTileTitle">NEBO</span>
            <span className="gameTileMeta">Online-Lobby</span>
          </button>

          <button
            className="gameTile"
            onClick={() => setScreen('hitster')}
          >
            <span className="gameTileIcon">🎵</span>
            <span className="gameTileTitle">Trackline</span>
            <span className="gameTileMeta">Lokaler Hotseat</span>
          </button>
        </div>
      </section>
    </main>
  )
}

export default App
