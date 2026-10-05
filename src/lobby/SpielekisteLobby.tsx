import { useEffect, useState } from 'react'
import { socket } from '../socket'

type SpielekisteLobbyProps = {
    onBack: () => void
    onChooseGame: (lobbyCode: string, isHost: boolean) => void
    initialLobbyCode?: string | null
}

type LobbyPlayer = {
    id: string
    playerId: string
    name: string
}

type Lobby = {
    code: string
    activeGame: 'nebo' | 'crossword' | null
    hostId: string
    players: LobbyPlayer[]
}

function SpielekisteLobby({
    onBack,
    onChooseGame,
    initialLobbyCode,
}: SpielekisteLobbyProps) {
    const [playerName, setPlayerName] = useState('')
    const [lobbyCode, setLobbyCode] = useState('')
    const [lobby, setLobby] = useState<Lobby | null>(null)
    const [error, setError] = useState('')
    const [isConfirmingLeave, setIsConfirmingLeave] = useState(false)

    const getPlayerId = () => {
        const existingPlayerId = localStorage.getItem('spielekiste-player-id')

        if (existingPlayerId) {
            return existingPlayerId
        }

        const newPlayerId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

        localStorage.setItem('spielekiste-player-id', newPlayerId)

        return newPlayerId
    }

    useEffect(() => {

        const handleLobbyCreated = (newLobby: Lobby) => {
            console.log('LOBBY RECEIVED:', newLobby)

            const me = newLobby.players.find(
                (player) => player.id === socket.id
            )

            if (me) {
                localStorage.setItem(
                    'spielekiste-player-name',
                    me.name
                )
            }

            localStorage.setItem(
                'spielekiste-last-lobby-code',
                newLobby.code
            )
            localStorage.setItem(
                'spielekiste-online-location',
                'lobby'
            )

            setLobby(newLobby)
            setError('')
        }

        socket.on('lobby-created', handleLobbyCreated)

        console.log('RETURN TO LOBBY CODE:', initialLobbyCode)

        if (initialLobbyCode) {
            console.log('REQUESTING LOBBY:', initialLobbyCode)
            socket.emit('get-spielekiste-lobby', initialLobbyCode)
        }

        const handleLobbyUpdated = (updatedLobby: Lobby) => {
            setLobby(updatedLobby)
        }

        const handleLobbyError = (message: string) => {
            setError(message)
        }

        const handleLobbyClosed = () => {
            localStorage.removeItem('spielekiste-last-lobby-code')
            localStorage.removeItem('spielekiste-online-location')

            setLobby(null)
            setLobbyCode('')
            setIsConfirmingLeave(false)
            onBack()
        }

        socket.on('spielekiste-lobby-updated', handleLobbyUpdated)
        socket.on('lobby-error', handleLobbyError)
        socket.on('lobby-closed', handleLobbyClosed)

        return () => {
            socket.off('lobby-created', handleLobbyCreated)
            socket.off('spielekiste-lobby-updated', handleLobbyUpdated)
            socket.off('lobby-error', handleLobbyError)
            socket.off('lobby-closed', handleLobbyClosed)
        }
    }, [initialLobbyCode])

    if (lobby) {
        const isHost = socket.id === lobby.hostId

        const leaveLobby = () => {
            if (!isConfirmingLeave) {
                setIsConfirmingLeave(true)

                window.setTimeout(() => {
                    setIsConfirmingLeave(false)
                }, 5000)

                return
            }

            localStorage.removeItem('spielekiste-last-lobby-code')
            localStorage.removeItem('spielekiste-online-location')

            socket.emit('leave-lobby', lobby.code)
            setLobby(null)
            setLobbyCode('')
            setIsConfirmingLeave(false)
            onBack()
        }


        return (
            <main className="page">
                <section className="card hero">
                    <button
                        className="dangerButton leaveLobbyButton"
                        onClick={leaveLobby}
                    >
                        {isConfirmingLeave
                            ? 'Wirklich Lobby verlassen?'
                            : '← Lobby verlassen'}
                    </button>
                    <p className="eyebrow">Spielekiste-Lobby</p>
                    <h1>{lobby.code}</h1>

                    <p className="subtitle">
                        Teile diesen Code mit deinen Mitspielern.
                    </p>

                    <div>
                        <h2>Spieler</h2>

                        {lobby.players.map((player) => (
                            <div key={player.playerId}>
                                <span>
                                    {player.name}
                                    {player.id === lobby.hostId ? ' 👑' : ''}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div>
                        {lobby.activeGame ? (
                            <>
                                <p>
                                    {lobby.activeGame === 'crossword'
                                        ? '🧩 Kreuzworträtsel läuft gerade.'
                                        : '🃏 NEBO läuft gerade.'}
                                </p>

                                <button
                                    onClick={() => {
                                        socket.emit('rejoin-active-game', {
                                            code: lobby.code,
                                        })
                                    }}
                                >
                                    🎮 Spiel wieder beitreten
                                </button>
                            </>
                        ) : isHost ? (
                            <button onClick={() => onChooseGame(lobby.code, isHost)}>
                                🎮 Spiel aussuchen
                            </button>
                        ) : (
                            <p>Warte darauf, dass der Host ein Spiel auswählt.</p>
                        )}
                    </div>
                </section>
            </main>
        )
    }

    return (
        <main className="page">
            <section className="card hero">
                <button className="backButton" onClick={onBack}>
                    ← Zurück zur Spielekiste
                </button>

                <p className="eyebrow">Online-Lobby</p>
                <h1>Spielekiste 🎮</h1>
                <p className="subtitle">
                    Erstellt eine Lobby oder tretet einer Lobby bei.
                </p>

                {error && <p>{error}</p>}

                <input
                    type="text"
                    placeholder="Dein Name"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                />

                <input
                    type="text"
                    placeholder="Lobby-Code"
                    value={lobbyCode}
                    onChange={(e) => setLobbyCode(e.target.value.toUpperCase())}
                />

                <button
                    onClick={() => {
                        localStorage.setItem('spielekiste-player-name', playerName)

                        socket.emit('create-lobby', {
                            playerName,
                            playerId: getPlayerId(),
                        })
                    }}
                >
                    Lobby erstellen
                </button>

                <button
                    onClick={() => {
                        localStorage.setItem('spielekiste-player-name', playerName)

                        socket.emit('join-lobby', {
                            code: lobbyCode,
                            playerName,
                            playerId: getPlayerId(),
                        })
                    }}
                >
                    Lobby beitreten
                </button>

            </section>
        </main>
    )
}


export default SpielekisteLobby