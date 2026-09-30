export type LobbyPlayer = {
    id: string
    playerId: string
    name: string
}

export type GameType = 'nebo' | 'crossword'

export type BaseLobby<TGameState> = {
    code: string
    game: GameType
    hostId: string
    players: LobbyPlayer[]
    gameState: TGameState
}