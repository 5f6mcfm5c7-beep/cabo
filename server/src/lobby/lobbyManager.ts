import type { LobbyPlayer } from './types.js'

type LobbyWithPlayers<TPlayer extends LobbyPlayer = LobbyPlayer> = {
    players: TPlayer[]
}

export function findPlayerByPlayerId<TPlayer extends LobbyPlayer>(
    lobby: LobbyWithPlayers<TPlayer>,
    playerId: string
): TPlayer | undefined {
    return lobby.players.find(player => player.playerId === playerId)
}

export function findPlayerBySocketId<TPlayer extends LobbyPlayer>(
    lobby: LobbyWithPlayers<TPlayer>,
    socketId: string
): TPlayer | undefined {
    return lobby.players.find(player => player.id === socketId)
}

export function makeLobbyCode(): string {
    return Math.random().toString(36).slice(2, 7).toUpperCase()
}