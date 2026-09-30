import type { BaseLobby, LobbyPlayer } from '../../lobby/types.js'

export type NeboPlayer = LobbyPlayer & {
    cards: number[]
    ready: boolean
    drawnCard: number | null
    drawSource: 'deck' | 'discard' | null
    totalScore: number
}

export type HighlightedCard = {
    playerId: string
    cardIndex: number
    type: 'memorize' | 'peek-own' | 'peek-opponent' | 'swap' | 'discard'
}

export type NeboGameState = {
    drawPile: number[]
    discardPile: number[]
    discardLocked: boolean
    highlightedCards: HighlightedCard[]
    memorizedPlayerIds: string[]
    currentPlayer: number
    caboCalledBy: string | null
    turnsAfterCabo: number
    roundScores: number[]
    caboPenaltyApplied: boolean
    kamikazePlayerId: string | null
    phase:
        | 'lobby'
        | 'memorize'
        | 'turn'
        | 'action-choice'
        | 'peek-own'
        | 'peek-opponent'
        | 'special-swap'
        | 'declare-set'
        | 'round-over'
        | 'game-over'
}

export type NeboLobby = Omit<BaseLobby, 'players'> &
    NeboGameState & {
        players: NeboPlayer[]
    }