import { useEffect, useState } from 'react'
import { socket } from '../socket'

type SpielekisteLobbyProps = {
    onBack: () => void
    onChooseGame: (lobbyCode: string) => void
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

    useEffect(() => {

        const handleLobbyCreated = (newLobby: Lobby) => {
            console.log('LOBBY RECEIVED:', newLobby)
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


        socket.on('lobby-updated', handleLobbyUpdated)
        socket.on('lobby-error', handleLobbyError)

        return () => {
            socket.off('lobby-created', handleLobbyCreated)
            socket.off('lobby-updated', handleLobbyUpdated)
            socket.off('lobby-error', handleLobbyError)

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
                        {isHost ? (
                            <button onClick={() => onChooseGame(lobby.code)}>
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
                        socket.emit('create-lobby', {
                            playerName,
                            playerId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                        })
                    }}
                >
                    Lobby erstellen
                </button>

                <button
                    onClick={() => {
                        socket.emit('join-lobby', {
                            code: lobbyCode,
                            playerName,
                            playerId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
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