import { useEffect, useState } from 'react'; import './App.css'
import NeboGame from './games/nebo/NeboGame.tsx'
import CrosswordGame from './games/crossword/CrosswordGame.tsx'
import SpielekisteLobby from './lobby/SpielekisteLobby.tsx'
import { socket } from './socket'
import type { CrosswordPuzzle } from './games/crossword/CrosswordGame'

type Screen =
  | 'home'
  | 'lobby'
  | 'games'
  | 'nebo'
  | 'hitster'
  | 'crossword-levels'
  | 'crossword'

type GameMode = 'local' | 'lobby'

type OnlineLocation = 'lobby' | 'nebo' | 'crossword'

type CrosswordSave = {
  entries: Record<string, string>
  revealedCells: string[]
}

type CrosswordLevelInfo = {
  id: string
  level: number
  title: string
  difficulty: 'easy' | 'medium' | 'hard'
  solutions: Record<string, string>
}

const getCrosswordSave = (puzzleId: string): CrosswordSave => {
  const saved = localStorage.getItem(`crossword-save-${puzzleId}`)

  if (!saved) {
    return {
      entries: {},
      revealedCells: [],
    }
  }

  try {
    return JSON.parse(saved) as CrosswordSave
  } catch {
    return {
      entries: {},
      revealedCells: [],
    }
  }
}

const getCrosswordProgress = (
  puzzleId: string,
  solutions: Record<string, string>
): number => {
  const totalLetters = Object.keys(solutions).length

  if (totalLetters === 0) return 0

  const save = getCrosswordSave(puzzleId)

  const correctLetters = Object.entries(solutions).filter(
    ([key, solution]) =>
      save.entries[key]?.toUpperCase() === solution.toUpperCase()
  ).length

  return Math.round((correctLetters / totalLetters) * 100)
}

function App() {
  const [crosswordLevels, setCrosswordLevels] = useState<CrosswordLevelInfo[]>([])
  const [localCrosswordPuzzle, setLocalCrosswordPuzzle] =
    useState<CrosswordPuzzle | null>(null)
  const [screen, setScreen] = useState<Screen>('home')
  const [activeLobbyCode, setActiveLobbyCode] = useState<string | null>(null)
  const [isLobbyHost, setIsLobbyHost] = useState(false)
  console.log('APP LOBBY CODE:', activeLobbyCode)
  const [gameMode, setGameMode] = useState<GameMode>('local')

  const saveOnlineLocation = (
    code: string,
    location: OnlineLocation
  ) => {
    localStorage.setItem('spielekiste-last-lobby-code', code)
    localStorage.setItem('spielekiste-online-location', location)
  }

  useEffect(() => {
    const savedCode = localStorage.getItem('spielekiste-last-lobby-code')
    const savedLocation = localStorage.getItem(
      'spielekiste-online-location'
    ) as OnlineLocation | null

    if (!savedCode || !savedLocation) return

    const restoreLobby = () => {
      const playerName = localStorage.getItem('spielekiste-player-name')
      const playerId = localStorage.getItem('spielekiste-player-id')

      if (!playerName || !playerId) return

      setActiveLobbyCode(savedCode)
      setGameMode('lobby')

      const handleLobbyRestored = () => {
        socket.off('lobby-created', handleLobbyRestored)

        if (savedLocation === 'lobby') {
          setScreen('lobby')
          return
        }

        socket.emit('rejoin-active-game', {
          code: savedCode,
        })
      }

      socket.once('lobby-created', handleLobbyRestored)

      socket.emit('join-lobby', {
        code: savedCode,
        playerName,
        playerId,
      })
    }

    if (socket.connected) {
      restoreLobby()
    } else {
      socket.once('connect', restoreLobby)
    }

    return () => {
      socket.off('connect', restoreLobby)
    }
  }, [])

  useEffect(() => {

    const handleSpielekisteLobbyUpdated = (lobby: {
      hostId: string
    }) => {
      setIsLobbyHost(lobby.hostId === socket.id)
    }

    const handleGameSelected = ({
      game,
      code,
    }: {
      game: 'nebo' | 'crossword'
      code: string
    }) => {
      setActiveLobbyCode(code)
      setGameMode('lobby')
      saveOnlineLocation(code, game)
      setScreen(game)
    }

    const handleCrosswordLevels = (levels: CrosswordLevelInfo[]) => {
      setCrosswordLevels(levels)
    }

    const handleCrosswordPuzzle = (puzzle: CrosswordPuzzle) => {
      setLocalCrosswordPuzzle(puzzle)
      setScreen('crossword')
    }

    const handleGameEnded = ({ code }: { code: string }) => {
      setActiveLobbyCode(code)
      saveOnlineLocation(code, 'lobby')
      setScreen('lobby')
    }

    const handleGameLeft = ({ code }: { code: string }) => {
      setActiveLobbyCode(code)
      saveOnlineLocation(code, 'lobby')
      setScreen('lobby')
    }

    socket.on(
      'spielekiste-lobby-updated',
      handleSpielekisteLobbyUpdated
    )
    socket.on('game-selected', handleGameSelected)
    socket.on('game-ended', handleGameEnded)
    socket.on('game-left', handleGameLeft)
    socket.on('crossword-levels', handleCrosswordLevels)
    socket.on('crossword-puzzle', handleCrosswordPuzzle)

    return () => {
      socket.off(
        'spielekiste-lobby-updated',
        handleSpielekisteLobbyUpdated
      )
      socket.off('game-selected', handleGameSelected)
      socket.off('game-ended', handleGameEnded)
      socket.off('game-left', handleGameLeft)
      socket.off('crossword-levels', handleCrosswordLevels)
      socket.off('crossword-puzzle', handleCrosswordPuzzle)
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
        onChooseGame={(lobbyCode, isHost) => {
          setActiveLobbyCode(lobbyCode)
          setIsLobbyHost(isHost)
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
          if (activeLobbyCode) {
            saveOnlineLocation(activeLobbyCode, 'lobby')
          }

          setScreen('lobby')
        }}
        lobbyCode={activeLobbyCode}
      />
    )
  }

  if (screen === 'crossword') {
    return (
      <CrosswordGame
        isHost={gameMode === 'lobby' && isLobbyHost}
        onBack={() => {
          if (gameMode === 'local') {
            setScreen('crossword-levels')
            return
          }

          if (activeLobbyCode) {
            saveOnlineLocation(activeLobbyCode, 'lobby')
          }

          setScreen('lobby')
        }}
        lobbyCode={gameMode === 'lobby' ? activeLobbyCode : null}
        localPuzzle={
          gameMode === 'local'
            ? localCrosswordPuzzle ?? undefined
            : undefined
        }
        localSave={
          gameMode === 'local' && localCrosswordPuzzle
            ? getCrosswordSave(localCrosswordPuzzle.id)
            : undefined
        }
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

  if (screen === 'crossword-levels') {
    return (
      <main className="page gamesHubPage">
        <section className="gamesHub">
          <button
            className="backButton"
            onClick={() => setScreen('games')}
          >
            ← Zurück
          </button>

          <p className="eyebrow">Kreuzworträtsel</p>
          <h1>Level auswählen 🧩</h1>

          <p className="subtitle">
            Wähle ein Rätsel aus.
          </p>

          <div className="crosswordLevelGrid">
            {crosswordLevels.map((levelInfo) => {
              const level = levelInfo.level
              const progress = getCrosswordProgress(
                levelInfo.id,
                levelInfo.solutions
              )

              return (
                <button
                  key={level}
                  className="crosswordLevelCard"
                  onClick={() => {
                    const puzzleId = levelInfo.id

                    if (gameMode === 'local') {
                      socket.emit('get-crossword-puzzle', puzzleId)
                      return
                    }

                    if (!activeLobbyCode) return

                    const crosswordSave = getCrosswordSave(puzzleId)

                    socket.emit('select-game', {
                      code: activeLobbyCode,
                      game: 'crossword',
                      puzzleId,
                      crosswordSave,
                    })
                  }}
                >
                  <span className="crosswordLevelNumber">
                    {level}
                  </span>

                  <span className="crosswordLevelProgress">
                    {progress} %{progress === 100 ? ' ✓' : ''}
                  </span>
                </button>
              )
            })}
          </div>
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
                  onClick={() => {
                    socket.emit('get-crossword-levels')
                    setScreen('crossword-levels')
                  }}
                >
                  <span className="gameTileIcon">🧩</span>
                  <span className="gameTileTitle">Kreuzworträtsel</span>
                  <span className="gameTileMeta">Online-Coop</span>
                </button>
              </>
            )}

            {gameMode === 'local' && (
              <>
                <button
                  className="gameTile"
                  onClick={() => {
                    socket.emit('get-crossword-levels')
                    setScreen('crossword-levels')
                  }}
                >
                  <span className="gameTileIcon">🧩</span>
                  <span className="gameTileTitle">Kreuzworträtsel</span>
                  <span className="gameTileMeta">Lokal</span>
                </button>

                <button
                  className="gameTile"
                  onClick={() => setScreen('hitster')}
                >
                  <span className="gameTileIcon">🎵</span>
                  <span className="gameTileTitle">Trackline</span>
                  <span className="gameTileMeta">Lokaler Hotseat</span>
                </button>
              </>
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
