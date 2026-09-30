import { useEffect, useState } from 'react'; import './App.css'
import NeboGame from './games/nebo/NeboGame.tsx'
import CrosswordGame from './games/crossword/CrosswordGame.tsx'
import SpielekisteLobby from './lobby/SpielekisteLobby.tsx'
import { socket } from './socket'

type Screen =
  | 'home'
  | 'lobby'
  | 'games'
  | 'nebo'
  | 'hitster'
  | 'crossword'

type GameMode = 'local' | 'lobby'
function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [activeLobbyCode, setActiveLobbyCode] = useState<string | null>(null)
  console.log('APP LOBBY CODE:', activeLobbyCode)
  const [gameMode, setGameMode] = useState<GameMode>('local')

  useEffect(() => {
    const handleGameSelected = ({
      game,
      code,
    }: {
      game: 'nebo' | 'crossword'
      code: string
    }) => {
      setActiveLobbyCode(code)
      setScreen(game)
    }

    const handleGameEnded = ({ code }: { code: string }) => {
      setActiveLobbyCode(code)
      setScreen('lobby')
    }

    const handleGameLeft = ({ code }: { code: string }) => {
      setActiveLobbyCode(code)
      setScreen('lobby')
    }

    socket.on('game-selected', handleGameSelected)
    socket.on('game-ended', handleGameEnded)
    socket.on('game-left', handleGameLeft)

    return () => {
      socket.off('game-selected', handleGameSelected)
      socket.off('game-ended', handleGameEnded)
      socket.off('game-left', handleGameLeft)
    }
  }, [])

  const selectLobbyGame = (game: 'nebo' | 'crossword') => {
    if (!activeLobbyCode) return

    socket.emit('select-game', {
      code: activeLobbyCode,
      game,
    })
  }

  if (screen === 'lobby') {
    return (
      <SpielekisteLobby
        initialLobbyCode={activeLobbyCode}
        onBack={() => {
          setActiveLobbyCode(null)
          setScreen('home')
        }}
        onChooseGame={(lobbyCode) => {
          setActiveLobbyCode(lobbyCode)
          setGameMode('lobby')
          setScreen('games')
        }}
      />
    )
  }

  if (screen === 'nebo') {
    return (
      <NeboGame
        onBack={() => {
          setScreen('lobby')
        }}
        lobbyCode={activeLobbyCode}
      />
    )
  }

  if (screen === 'crossword') {
    return (
      <CrosswordGame
        onBack={() => setScreen('lobby')}
        lobbyCode={activeLobbyCode}
      />
    )
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

  if (screen === 'games') {
    return (
      <main className="page gamesHubPage">
        <section className="gamesHub">
          <button
            className="backButton"
            onClick={() =>
              setScreen(gameMode === 'lobby' ? 'lobby' : 'home')
            }
          >
            ← Zurück
          </button>

          <p className="eyebrow">Willkommen in der</p>
          <h1>Spielekiste 🎲</h1>

          <p className="subtitle">
            Wähle ein Spiel aus und leg direkt los.
          </p>

          <div className="gamesGrid">
            {gameMode === 'lobby' && (
              <>
                <button
                  className="gameTile"
                  onClick={() => selectLobbyGame('nebo')}                >
                  <span className="gameTileIcon">🃏</span>
                  <span className="gameTileTitle">NEBO</span>
                  <span className="gameTileMeta">Online-Multiplayer</span>
                </button>

                <button
                  className="gameTile"
                  onClick={() => selectLobbyGame('crossword')}                >
                  <span className="gameTileIcon">🧩</span>
                  <span className="gameTileTitle">Kreuzworträtsel</span>
                  <span className="gameTileMeta">Online-Coop</span>
                </button>
              </>
            )}

            {gameMode === 'local' && (
              <button
                className="gameTile"
                onClick={() => setScreen('hitster')}
              >
                <span className="gameTileIcon">🎵</span>
                <span className="gameTileTitle">Trackline</span>
                <span className="gameTileMeta">Lokaler Hotseat</span>
              </button>
            )}
          </div>
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
          Wie möchtest du spielen?
        </p>

        <div className="gamesGrid">
          <button
            className="gameTile"
            onClick={() => setScreen('lobby')}
          >
            <span className="gameTileIcon">🌐</span>
            <span className="gameTileTitle">Online-Lobby</span>
            <span className="gameTileMeta">
              Mit Freunden online spielen
            </span>
          </button>

          <button
            className="gameTile"
            onClick={() => {
              setGameMode('local')
              setScreen('games')
            }}
          >
            <span className="gameTileIcon">🏠</span>
            <span className="gameTileTitle">Lokale Spiele</span>
            <span className="gameTileMeta">
              Gemeinsam an einem Gerät
            </span>
          </button>
        </div>
      </section>
    </main>
  )
}

export default App
