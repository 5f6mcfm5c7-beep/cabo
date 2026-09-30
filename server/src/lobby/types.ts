export type LobbyPlayer = {
    id: string
    playerId: string
    name: string
}

export type GameType = 'nebo' | 'crossword'

export type BaseLobby = {
    code: string
    activeGame: GameType | null
    hostId: string
    players: LobbyPlayer[]
}

export type Lobby = BaseLobby