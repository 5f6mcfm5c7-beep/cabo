import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import type { NeboLobby } from './games/nebo/types.js'
import type { CrosswordGameState } from './games/crossword/types'
import {
    crosswordLevels,
    getCrosswordPuzzle,
} from './games/crossword/puzzles'
import type { Lobby } from './lobby/types'
import {
    makeLobbyCode,
    findPlayerByPlayerId,
    findPlayerBySocketId,
} from './lobby/lobbyManager'

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
})

const lobbies: Record<string, NeboLobby> = {}
const spielekisteLobbies: Record<string, Lobby> = {}
const crosswordGames: Record<string, CrosswordGameState> = {}

type CrosswordPresence = {
    playerId: string
    name: string
    row: number
    col: number
    direction: 'right' | 'down'
}

const crosswordPresence: Record<string, CrosswordPresence[]> = {}

function createDeck() {
    const deck = [
        0, 0,
        1, 1, 1, 1,
        2, 2, 2, 2,
        3, 3, 3, 3,
        4, 4, 4, 4,
        5, 5, 5, 5,
        6, 6, 6, 6,
        7, 7, 7, 7,
        8, 8, 8, 8,
        9, 9, 9, 9,
        10, 10, 10, 10,
        11, 11, 11, 11,
        12, 12, 12, 12,
        13, 13,
    ]

    return deck.sort(() => Math.random() - 0.5)
}

function shuffleCards(cards: number[]) {
    return [...cards].sort(() => Math.random() - 0.5)
}

function getGuestName(players: { name: string }[]) {
    let number = 1

    while (players.some((player) => player.name === `Gast ${number}`)) {
        number++
    }

    return `Gast ${number}`
}


app.use(cors())

app.get('/', (_req, res) => {
    res.send('CABO server is running 🃏')
})

function isPlayersTurn(lobby: NeboLobby, socketId: string) {
    return lobby.players[lobby.currentPlayer]?.id === socketId
}

function handScore(cards: number[]) {
    return cards.reduce((sum, card) => sum + card, 0)
}

function isKamikaze(cards: number[]) {
    const twelves = cards.filter((card) => card === 12).length
    const thirteens = cards.filter((card) => card === 13).length

    return twelves === 2 && thirteens === 2
}

function finishRound(lobby: NeboLobby) {

    const kamikazePlayer = lobby.players.find((player) =>
        isKamikaze(player.cards)
    )

    if (kamikazePlayer) {
        const roundScores = lobby.players.map((player) =>
            player.id === kamikazePlayer.id ? 0 : 50
        )

        lobby.players = lobby.players.map((player, index) => {
            let newTotal = player.totalScore + (roundScores[index] ?? 0)

            if (newTotal === 100) newTotal = 50

            return {
                ...player,
                totalScore: newTotal,
                ready: false,
                drawnCard: null,
                drawSource: null,
            }
        })

        lobby.roundScores = roundScores
        lobby.caboPenaltyApplied = false
        lobby.kamikazePlayerId = kamikazePlayer.id

        if (lobby.players.some((player) => player.totalScore > 100)) {
            lobby.phase = 'game-over'
        } else {
            lobby.phase = 'round-over'
        }

        return
    }

    const rawScores = lobby.players.map((player) => handScore(player.cards))
    const lowestScore = Math.min(...rawScores)

    const caboCallerIndex = lobby.players.findIndex(
        (player) => player.id === lobby.caboCalledBy
    )

    const caboCallerHasLowestScore =
        caboCallerIndex !== -1 && rawScores[caboCallerIndex] === lowestScore

    const roundScores = rawScores.map((score, index) => {
        const hasLowestScore = score === lowestScore

        if (caboCallerIndex !== -1) {
            if (index === caboCallerIndex && caboCallerHasLowestScore) return 0
            if (index === caboCallerIndex && !caboCallerHasLowestScore) return score + 5
            if (!caboCallerHasLowestScore && hasLowestScore) return 0
            return score
        }

        return hasLowestScore ? 0 : score
    })

    lobby.players = lobby.players.map((player, index) => {
        let newTotal = player.totalScore + (roundScores[index] ?? 0)

        if (newTotal === 100) newTotal = 50

        return {
            ...player,
            totalScore: newTotal,
            ready: false,
            drawnCard: null,
            drawSource: null,
        }
    })

    lobby.roundScores = roundScores
    lobby.caboPenaltyApplied =
        caboCallerIndex !== -1 && !caboCallerHasLowestScore

    if (lobby.players.some((player) => player.totalScore > 100)) {
        lobby.phase = 'game-over'
    } else {
        lobby.phase = 'round-over'
    }
}

function advanceTurn(lobby: NeboLobby, code?: string) {
    if (lobby.caboCalledBy !== null) {
        lobby.turnsAfterCabo += 1

        if (lobby.turnsAfterCabo >= lobby.players.length - 1) {
            if (code) {
                setTimeout(() => {
                    finishRound(lobby)
                    io.to(code).emit('lobby-updated', lobby)
                }, 3000)
            }
            return
        }
    }

    lobby.currentPlayer =
        (lobby.currentPlayer + 1) % lobby.players.length

    lobby.phase = 'turn'
}

function goToNextPlayer(lobby: NeboLobby, code?: string) {
    advanceTurn(lobby, code)
}

function reconnectPlayer(lobby: NeboLobby, oldSocketId: string, newSocketId: string) {
    lobby.players = lobby.players.map((player) =>
        player.id === oldSocketId
            ? {
                ...player,
                id: newSocketId,
            }
            : player
    )

    if (lobby.hostId === oldSocketId) {
        lobby.hostId = newSocketId
    }

    if (lobby.caboCalledBy === oldSocketId) {
        lobby.caboCalledBy = newSocketId
    }

    if (lobby.kamikazePlayerId === oldSocketId) {
        lobby.kamikazePlayerId = newSocketId
    }

    lobby.highlightedCards = lobby.highlightedCards.map((card) =>
        card.playerId === oldSocketId
            ? {
                ...card,
                playerId: newSocketId,
            }
            : card
    )
}

function finishMemorizeForPlayer(lobby: NeboLobby, code: string, socketId: string) {
    if (lobby.phase !== 'memorize') return

    const player = findPlayerBySocketId(lobby, socketId)

    if (!player) return

    lobby.highlightedCards = lobby.highlightedCards.filter(
        (card) => !(card.playerId === socketId && card.type === 'memorize')
    )

    player.ready = true

    if (!lobby.memorizedPlayerIds.includes(player.playerId)) {
        lobby.memorizedPlayerIds.push(player.playerId)
    }

    const allReady = lobby.players.every((player) => player.ready)

    if (allReady) {
        lobby.phase = 'turn'
        lobby.currentPlayer = 0
    }

    io.to(code).emit('lobby-updated', lobby)
}

function finishPeekOwn(lobby: NeboLobby, code: string, socketId: string) {
    if (!isPlayersTurn(lobby, socketId)) return
    if (lobby.phase !== 'peek-own') return

    lobby.highlightedCards = lobby.highlightedCards.filter(
        (card) => card.type !== 'peek-own'
    )

    goToNextPlayer(lobby, code)

    io.to(code).emit('lobby-updated', lobby)
}

function finishPeekOpponent(lobby: NeboLobby, code: string, socketId: string) {
    if (!isPlayersTurn(lobby, socketId)) return
    if (lobby.phase !== 'peek-opponent') return

    lobby.highlightedCards = lobby.highlightedCards.filter(
        (card) => card.type !== 'peek-opponent'
    )

    goToNextPlayer(lobby, code)

    io.to(code).emit('lobby-updated', lobby)
}

function finishMemorizeForPersistentPlayer(lobby: NeboLobby, code: string, persistentPlayerId: string) {
    const player = findPlayerByPlayerId(lobby, persistentPlayerId)

    if (!player) return

    finishMemorizeForPlayer(lobby, code, player.id)
}

function finishPeekOwnForPersistentPlayer(lobby: NeboLobby, code: string, persistentPlayerId: string) {
    const player = findPlayerByPlayerId(lobby, persistentPlayerId)

    if (!player) return

    finishPeekOwn(lobby, code, player.id)
}

function finishPeekOpponentForPersistentPlayer(lobby: NeboLobby, code: string, persistentPlayerId: string) {
    const player = findPlayerByPlayerId(lobby, persistentPlayerId)

    if (!player) return

    finishPeekOpponent(lobby, code, player.id)
}

function leaveLobby(lobby: NeboLobby, code: string, socketId: string) {
    const spielekisteLobby = spielekisteLobbies[code]

    if (!spielekisteLobby) return

    const leavingPlayer = spielekisteLobby.players.find(
        (player) => player.id === socketId
    )

    if (!leavingPlayer) return

    spielekisteLobby.players = spielekisteLobby.players.filter(
        (player) => player.id !== socketId
    )

    lobby.players = lobby.players.filter(
        (player) => player.id !== socketId
    )

    lobby.highlightedCards = lobby.highlightedCards.filter(
        (card) => card.playerId !== socketId
    )

    if (spielekisteLobby.hostId === socketId) {
        io.to(code).emit('lobby-closed')

        delete spielekisteLobbies[code]
        delete lobbies[code]
        delete crosswordGames[code]
        delete crosswordPresence[code]

        return
    }

    if (spielekisteLobby.players.length === 0) {
        delete spielekisteLobbies[code]
        delete lobbies[code]
        delete crosswordGames[code]
        delete crosswordPresence[code]

        return
    }

    if (lobby.currentPlayer >= lobby.players.length) {
        lobby.currentPlayer = 0
    }

    io.to(code).emit('spielekiste-lobby-updated', spielekisteLobby)
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id)

    socket.on(
        'create-lobby',
        ({
            playerName,
            playerId,
        }: {
            playerName: string
            playerId: string
            memorizedPlayerIds: [],
        }) => {

            console.log('Create lobby request from:', playerName)

            const code = makeLobbyCode()
            const finalPlayerName = playerName.trim() || 'Gast 1'

            const lobby: NeboLobby = {
                code,
                activeGame: null,
                hostId: socket.id,
                players: [
                    {
                        id: socket.id,
                        playerId,
                        name: finalPlayerName,
                        cards: [],
                        ready: false,
                        drawnCard: null,
                        drawSource: null,
                        totalScore: 0,
                    }
                ],
                drawPile: [],
                discardPile: [],
                discardLocked: false,
                highlightedCards: [],
                memorizedPlayerIds: [],
                currentPlayer: 0,
                caboCalledBy: null,
                turnsAfterCabo: 0,
                roundScores: [],
                caboPenaltyApplied: false,
                kamikazePlayerId: null,
                phase: 'lobby',
            }
            lobbies[code] = lobby

            spielekisteLobbies[code] = {
                code,
                activeGame: null,
                hostId: socket.id,
                players: lobby.players.map(({ id, playerId, name }) => ({
                    id,
                    playerId,
                    name,
                })),
            }

            socket.join(code)

            socket.emit('lobby-created', spielekisteLobbies[code])
        })

    socket.on(
        'join-lobby',
        ({
            code,
            playerName,
            playerId,
        }: {
            code: string
            playerName: string
            playerId: string
        }) => {
            const lobby = lobbies[code]

            if (!lobby) {
                socket.emit('lobby-error', 'NeboLobby nicht gefunden.')
                return
            }

            const finalPlayerName =
                playerName.trim() || getGuestName(lobby.players)

            const existingPlayer = findPlayerByPlayerId(lobby, playerId)

            if (existingPlayer) {
                const oldSocketId = existingPlayer.id

                reconnectPlayer(lobby, oldSocketId, socket.id)

                const spielekisteLobby = spielekisteLobbies[code]
                const spielekistePlayer = spielekisteLobby?.players.find(
                    (player) => player.playerId === playerId
                )

                if (spielekistePlayer) {
                    spielekistePlayer.id = socket.id
                    spielekistePlayer.name = finalPlayerName
                }

                if (spielekisteLobby?.hostId === oldSocketId) {
                    spielekisteLobby.hostId = socket.id
                }

                const reconnectedPlayer = lobby.players.find(
                    (player) => player.playerId === playerId
                )

                if (reconnectedPlayer) {
                    reconnectedPlayer.name = finalPlayerName
                }

                socket.join(code)
                socket.emit('lobby-created', lobby)
                io.to(code).emit('lobby-updated', lobby)

                io.to(code).emit(
                    'spielekiste-lobby-updated',
                    spielekisteLobbies[code]
                )

                return
            }

            if (lobby.players.length >= 5) {
                socket.emit('lobby-error', 'Diese NeboLobby ist bereits voll.')
                return
            }

            lobby.players.push({
                id: socket.id,
                playerId,
                name: finalPlayerName,
                cards: [],
                ready: false,
                drawnCard: null,
                drawSource: null,
                totalScore: 0,
            })

            spielekisteLobbies[code]?.players.push({
                id: socket.id,
                playerId,
                name: finalPlayerName,
            })

            socket.join(code)

            socket.emit('lobby-created', spielekisteLobbies[code])

            io.to(code).emit('lobby-updated', lobby)

            io.to(code).emit(
                'spielekiste-lobby-updated',
                spielekisteLobbies[code]
            )
        })

    socket.on(
        'select-game',
        ({
            code,
            game,
            puzzleId,
            crosswordSave,
        }: {
            code: string
            game: 'nebo' | 'crossword'
            puzzleId?: string
            crosswordSave?: {
                entries: Record<string, string>
                revealedCells: string[]
            }
        }) => {
            const spielekisteLobby = spielekisteLobbies[code]

            if (!spielekisteLobby) {
                socket.emit('lobby-error', 'Lobby nicht gefunden.')
                return
            }

            if (spielekisteLobby.hostId !== socket.id) {
                socket.emit('lobby-error', 'Nur der Host kann ein Spiel starten.')
                return
            }

            if (game === 'nebo') {
                const neboLobby = lobbies[code]

                if (!neboLobby) {
                    socket.emit('lobby-error', 'NEBO-Spiel nicht gefunden.')
                    return
                }

                if (neboLobby.players.length < 2) {
                    socket.emit(
                        'lobby-error',
                        'Für NEBO werden mindestens 2 Spieler benötigt.'
                    )
                    return
                }

                const deck = createDeck()

                neboLobby.players = neboLobby.players.map((player, index) => ({
                    ...player,
                    cards: deck.slice(index * 4, index * 4 + 4),
                    ready: false,
                    drawnCard: null,
                    drawSource: null,
                    totalScore: 0,
                }))

                const usedCards = neboLobby.players.length * 4

                neboLobby.drawPile = deck.slice(usedCards + 1)
                neboLobby.discardPile = [deck[usedCards]!]
                neboLobby.discardLocked = false
                neboLobby.currentPlayer = 0
                neboLobby.caboCalledBy = null
                neboLobby.turnsAfterCabo = 0
                neboLobby.roundScores = []
                neboLobby.caboPenaltyApplied = false
                neboLobby.kamikazePlayerId = null
                neboLobby.phase = 'memorize'
                neboLobby.highlightedCards = []
                neboLobby.memorizedPlayerIds = []
            }

            if (game === 'crossword') {
                if (!puzzleId) {
                    socket.emit('lobby-error', 'Kein Kreuzworträtsel ausgewählt.')
                    return
                }

                const puzzle = getCrosswordPuzzle(puzzleId)

                if (!puzzle) {
                    socket.emit('lobby-error', 'Kreuzworträtsel nicht gefunden.')
                    return
                }

                crosswordGames[code] = {
                    puzzleId: puzzle.id,
                    entries: crosswordSave?.entries ?? {},
                    revealedCells: crosswordSave?.revealedCells ?? [],
                    completed: false,
                }

                crosswordPresence[code] = []
            }

            spielekisteLobby.activeGame = game

            io.to(code).emit('game-selected', {
                game,
                code,
            })
        }
    )

    socket.on(
        'rejoin-active-game',
        ({ code }: { code: string }) => {
            const spielekisteLobby = spielekisteLobbies[code]

            if (!spielekisteLobby) {
                socket.emit('lobby-error', 'Lobby nicht gefunden.')
                return
            }

            const player = spielekisteLobby.players.find(
                (player) => player.id === socket.id
            )

            if (!player) {
                socket.emit('lobby-error', 'Du bist nicht in dieser Lobby.')
                return
            }

            const activeGame = spielekisteLobby.activeGame

            if (!activeGame) {
                socket.emit('lobby-error', 'Aktuell läuft kein Spiel.')
                return
            }

            socket.emit('game-selected', {
                game: activeGame,
                code,
            })
        }
    )

    socket.on('get-spielekiste-lobby', (code: string) => {
        const lobby = spielekisteLobbies[code]

        if (!lobby) return

        socket.emit('spielekiste-lobby-updated', lobby)
    })


    socket.on('get-nebo-lobby', (code: string) => {
        const lobby = lobbies[code]

        if (!lobby) {
            socket.emit('lobby-error', 'NEBO-Spiel nicht gefunden.')
            return
        }

        socket.emit('game-started', lobby)
    })

    socket.on('get-crossword-levels', () => {
        const levels = crosswordLevels.map((level) => ({
            id: level.id,
            level: level.level,
            title: level.title,
            difficulty: level.difficulty,

            solutions: Object.fromEntries(
                level.puzzle.cells
                    .filter((cell) => cell.type === 'letter')
                    .map((cell) => [
                        `${cell.row}-${cell.col}`,
                        cell.solution,
                    ])
            ),
        }))

        socket.emit('crossword-levels', levels)
    })

    socket.on('get-crossword-puzzle', (puzzleId: string) => {
        const puzzle = getCrosswordPuzzle(puzzleId)

        if (!puzzle) {
            socket.emit('lobby-error', 'Kreuzworträtsel nicht gefunden.')
            return
        }

        socket.emit('crossword-puzzle', puzzle)
    })

    socket.on('get-crossword-game', (code: string) => {
        const game = crosswordGames[code]

        if (!game) {
            socket.emit('lobby-error', 'Kreuzworträtsel nicht gefunden.')
            return
        }

        const puzzle = getCrosswordPuzzle(game.puzzleId)

        if (!puzzle) {
            socket.emit('lobby-error', 'Kreuzworträtsel nicht gefunden.')
            return
        }

        socket.emit('crossword-updated', {
            puzzle,
            game,
        })

        socket.emit(
            'crossword-presence-updated',
            crosswordPresence[code] ?? []
        )
    })


    socket.on(
        'update-crossword-presence',
        ({
            code,
            row,
            col,
            direction,
        }: {
            code: string
            row: number
            col: number
            direction: 'right' | 'down'
        }) => {
            const game = crosswordGames[code]
            const lobby = spielekisteLobbies[code]

            if (!game || !lobby) return

            const player = lobby.players.find(
                (player) => player.id === socket.id
            )

            if (!player) return

            const presence: CrosswordPresence = {
                playerId: player.playerId,
                name: player.name,
                row,
                col,
                direction,
            }

            const currentPresence = crosswordPresence[code] ?? []

            crosswordPresence[code] = [
                ...currentPresence.filter(
                    (entry) => entry.playerId !== player.playerId
                ),
                presence,
            ]

            for (const lobbyPlayer of lobby.players) {
                const otherPlayersPresence = crosswordPresence[code].filter(
                    (entry) => entry.playerId !== lobbyPlayer.playerId
                )

                io.to(lobbyPlayer.id).emit(
                    'crossword-presence-updated',
                    otherPlayersPresence
                )
            }

        }
    )

    socket.on(
        'update-crossword-cell',
        ({
            code,
            row,
            col,
            value,
        }: {
            code: string
            row: number
            col: number
            value: string
        }) => {
            const game = crosswordGames[code]

            if (!game) return

            const puzzle = getCrosswordPuzzle(game.puzzleId)

            if (!puzzle) return

            const cellExists = puzzle.cells.some(
                (cell) => cell.row === row && cell.col === col
            )

            if (!cellExists) return

            const key = `${row}-${col}`

            if (game.revealedCells.includes(key)) return

            const letter = value.slice(-1).toUpperCase()

            game.entries[key] = letter

            io.to(code).emit('crossword-updated', {
                puzzle,
                game,
            })
        }
    )

    socket.on(
        'reveal-crossword-cell',
        ({
            code,
            row,
            col,
        }: {
            code: string
            row: number
            col: number
        }) => {
            const game = crosswordGames[code]

            if (!game) return

            const puzzle = getCrosswordPuzzle(game.puzzleId)

            if (!puzzle) return

            const cell = puzzle.cells.find(
                (cell) =>
                    cell.type === 'letter' &&
                    cell.row === row &&
                    cell.col === col
            )

            if (!cell || cell.type !== 'letter') return

            const key = `${row}-${col}`

            if (game.revealedCells.includes(key)) return

            game.entries[key] = cell.solution
            game.revealedCells.push(key)

            io.to(code).emit('crossword-updated', {
                puzzle,
                game,
            })
        }
    )

    socket.on('start-game', (code: string) => {
        const lobby = lobbies[code]

        if (!lobby) return
        if (socket.id !== lobby.hostId) return
        if (lobby.players.length < 2) return

        const deck = createDeck()

        lobby.players = lobby.players.map((player, index) => ({
            ...player,
            cards: deck.slice(index * 4, index * 4 + 4),
            ready: false,
            drawnCard: null,
            drawSource: null,
            totalScore: 0,
        }))

        const usedCards = lobby.players.length * 4

        lobby.drawPile = deck.slice(usedCards + 1)
        lobby.discardPile = [deck[usedCards]!]
        lobby.discardLocked = false
        lobby.currentPlayer = 0
        lobby.caboCalledBy = null
        lobby.turnsAfterCabo = 0
        lobby.roundScores = []
        lobby.caboPenaltyApplied = false
        lobby.kamikazePlayerId = null
        lobby.phase = 'memorize'
        lobby.highlightedCards = []
        lobby.memorizedPlayerIds = []

        console.log('GAME STARTED')
        console.log(lobby.players)

        io.to(code).emit('game-started', lobby)
    })

    socket.on(
        'highlight-card',
        ({
            code,
            cardIndex,
            type,
        }: {
            code: string
            cardIndex: number
            type: 'memorize' | 'peek-own' | 'peek-opponent' | 'swap'
        }) => {
            const lobby = lobbies[code]

            if (!lobby) return

            const player = lobby.players.find((player) => player.id === socket.id)

            if (!player) return

            if (type === 'memorize') {
                if (lobby.phase !== 'memorize') return
                if (player.ready) return
                if (lobby.memorizedPlayerIds.includes(player.playerId)) return

                const ownMemorizeHighlights = lobby.highlightedCards.filter(
                    (card) => card.playerId === socket.id && card.type === 'memorize'
                )

                if (ownMemorizeHighlights.length >= 2) return
            }

            const alreadyHighlighted = lobby.highlightedCards.some(
                (card) =>
                    card.playerId === socket.id &&
                    card.cardIndex === cardIndex &&
                    card.type === type
            )

            if (!alreadyHighlighted) {
                lobby.highlightedCards = [
                    ...lobby.highlightedCards,
                    {
                        playerId: socket.id,
                        cardIndex,
                        type,
                    },
                ]

                if (type === 'memorize') {
                    const ownMemorizeHighlights = lobby.highlightedCards.filter(
                        (card) => card.playerId === socket.id && card.type === 'memorize'
                    )

                    if (ownMemorizeHighlights.length >= 2) {
                        const persistentPlayerId = player.playerId

                        setTimeout(() => {
                            finishMemorizeForPersistentPlayer(lobby, code, persistentPlayerId)
                        }, 5000)
                    }
                }

                if (type === 'peek-own') {
                    const player = lobby.players.find((player) => player.id === socket.id)

                    if (!player) return

                    const persistentPlayerId = player.playerId

                    setTimeout(() => {
                        finishPeekOwnForPersistentPlayer(lobby, code, persistentPlayerId)
                    }, 3000)
                }
            }

            io.to(code).emit('lobby-updated', lobby)
        }
    )

    socket.on(
        'highlight-target-card',
        ({
            code,
            playerId,
            cardIndex,
            type,
        }: {
            code: string
            playerId: string
            cardIndex: number
            type: 'peek-opponent' | 'swap'
        }) => {
            const lobby = lobbies[code]

            if (!lobby) return

            const targetPlayer = lobby.players.find((player) => player.id === playerId)

            if (!targetPlayer) return
            if (targetPlayer.cards[cardIndex] === undefined) return

            const alreadyHighlighted = lobby.highlightedCards.some(
                (card) =>
                    card.playerId === playerId &&
                    card.cardIndex === cardIndex &&
                    card.type === type
            )

            if (!alreadyHighlighted) {
                lobby.highlightedCards = [
                    ...lobby.highlightedCards,
                    {
                        playerId,
                        cardIndex,
                        type,
                    },
                ]

                if (type === 'peek-opponent') {
                    const player = lobby.players.find((player) => player.id === socket.id)

                    if (!player) return

                    const persistentPlayerId = player.playerId

                    setTimeout(() => {
                        finishPeekOpponentForPersistentPlayer(lobby, code, persistentPlayerId)
                    }, 3000)
                }
            }

            io.to(code).emit('lobby-updated', lobby)
        }
    )

    socket.on('clear-highlights', (code: string) => {
        const lobby = lobbies[code]

        if (!lobby) return

        lobby.highlightedCards = []

        io.to(code).emit('lobby-updated', lobby)
    })

    socket.on('start-cards-done', (code: string) => {
        const lobby = lobbies[code]

        if (!lobby) return

        finishMemorizeForPlayer(lobby, code, socket.id)
    })

    socket.on('end-turn', (code: string) => {
        const lobby = lobbies[code]

        if (!lobby) return

        if (!isPlayersTurn(lobby, socket.id)) return

        const player = lobby.players.find(
            (player) => player.id === socket.id
        )

        if (player) {
            player.drawnCard = null
            player.drawSource = null
        }

        goToNextPlayer(lobby, code)

        io.to(code).emit('lobby-updated', lobby)
    })

    socket.on('draw-from-deck', (code: string) => {
        console.log('DRAW REQUEST', socket.id)

        const lobby = lobbies[code]

        if (!lobby) {
            console.log('NO LOBBY')
            return
        }

        if (!isPlayersTurn(lobby, socket.id)) {
            console.log('NOT YOUR TURN')
            return
        }

        const player = lobby.players.find(
            (player) => player.id === socket.id
        )

        if (!player) {
            console.log('NO PLAYER')
            return
        }

        if (player.drawnCard !== null) {
            console.log('ALREADY HAS CARD')
            return
        }

        if (lobby.drawPile.length === 0) {
            if (lobby.discardPile.length <= 1) {
                console.log('DRAWPILE EMPTY')
                return
            }

            const topDiscard = lobby.discardPile[lobby.discardPile.length - 1]
            const cardsToShuffle = lobby.discardPile.slice(0, -1)

            lobby.discardPile = [topDiscard!]
            lobby.drawPile = shuffleCards(cardsToShuffle)
        }

        const card = lobby.drawPile.shift()

        if (card === undefined) {
            console.log('CARD UNDEFINED')
            return
        }

        console.log('CARD DRAWN:', card)

        player.drawnCard = card
        player.drawSource = 'deck'

        socket.emit('draw-card-result', card)

        io.to(code).emit('lobby-updated', lobby)
    })

    socket.on('draw-from-discard', (code: string) => {
        const lobby = lobbies[code]

        if (!lobby) return

        if (!isPlayersTurn(lobby, socket.id)) return

        if (lobby.discardLocked) return

        const player = lobby.players.find(
            (player) => player.id === socket.id
        )

        if (!player) return

        if (player.drawnCard !== null) return

        const card = lobby.discardPile.pop()

        if (card === undefined) return

        player.drawnCard = card
        player.drawSource = 'discard'

        socket.emit('draw-card-result', card)

        io.to(code).emit('lobby-updated', lobby)
    })

    socket.on('discard-drawn-card', (code: string) => {
        const lobby = lobbies[code]

        if (!lobby) return

        if (!isPlayersTurn(lobby, socket.id)) return

        const player = lobby.players.find(
            (player) => player.id === socket.id
        )

        if (!player) return

        if (player.drawnCard === null) return
        if (player.drawSource !== 'deck') return

        const discardedCard = player.drawnCard

        lobby.discardPile.push(discardedCard)
        lobby.discardLocked = false

        player.drawnCard = null
        player.drawSource = null

        const isActionCard =
            discardedCard === 7 ||
            discardedCard === 8 ||
            discardedCard === 9 ||
            discardedCard === 10 ||
            discardedCard === 11 ||
            discardedCard === 12

        lobby.highlightedCards = [
            {
                playerId: 'discard-pile',
                cardIndex: -1,
                type: 'discard',
            },
        ]

        if (isActionCard) {
            lobby.phase = 'action-choice'
            io.to(code).emit('lobby-updated', lobby)
            return
        }

        io.to(code).emit('lobby-updated', lobby)

        setTimeout(() => {
            lobby.highlightedCards = []

            goToNextPlayer(lobby, code)

            io.to(code).emit('lobby-updated', lobby)
        }, 1500)
    })

    socket.on(
        'declare-set',
        ({
            code,
            cardIndexes,
        }: {
            code: string
            cardIndexes: number[]
        }) => {
            const lobby = lobbies[code]

            if (!lobby) return

            if (!isPlayersTurn(lobby, socket.id)) return

            const player = lobby.players.find(
                (player) => player.id === socket.id
            )

            if (!player) return

            if (player.drawnCard === null) return

            if (cardIndexes.length < 2 || cardIndexes.length > 4) {
                socket.emit('set-error', 'Wähle 2 bis 4 Karten aus.')
                return
            }

            const uniqueIndexes = [...new Set(cardIndexes)]

            if (uniqueIndexes.length !== cardIndexes.length) {
                socket.emit('set-error', 'Eine Karte wurde doppelt ausgewählt.')
                return
            }

            const selectedCards = uniqueIndexes.map((index) => player.cards[index])

            if (selectedCards.some((card) => card === undefined)) {
                socket.emit('set-error', 'Ungültige Kartenauswahl.')
                return
            }

            const firstCard = selectedCards[0]
            const allSame = selectedCards.every((card) => card === firstCard)

            if (!allSame) {
                lobby.discardPile.push(player.drawnCard)
                lobby.discardLocked = false
                player.drawnCard = null
                player.drawSource = null

                socket.emit('set-error', 'Kein gültiger Satz. Dein Zug ist beendet.')

                goToNextPlayer(lobby, code)

                lobby.highlightedCards = lobby.highlightedCards.filter(
                    (card) => card.type !== 'discard'
                )

                io.to(code).emit('lobby-updated', lobby)
                return
            }

            const insertAt = Math.min(...uniqueIndexes)
            const removedCards = uniqueIndexes.map((index) => player.cards[index]!)
            const newCards = player.cards.filter(
                (_card, index) => !uniqueIndexes.includes(index)
            )

            newCards.splice(insertAt, 0, player.drawnCard)

            player.cards = newCards
            lobby.discardPile.push(...removedCards)
            lobby.discardLocked = true

            player.drawnCard = null
            player.drawSource = null

            goToNextPlayer(lobby, code
            )
            io.to(code).emit('lobby-updated', lobby)
        }
    )

    socket.on(
        'use-action',
        ({
            code,
            card,
        }: {
            code: string
            card: number
        }) => {
            const lobby = lobbies[code]

            if (!lobby) return

            if (!isPlayersTurn(lobby, socket.id)) return

            if (lobby.phase !== 'action-choice') return

            if (card === 7 || card === 8) {
                lobby.phase = 'peek-own'
            }

            if (card === 9 || card === 10) {
                lobby.phase = 'peek-opponent'
            }

            if (card === 11 || card === 12) {
                lobby.phase = 'special-swap'
            }

            lobby.highlightedCards = lobby.highlightedCards.filter(
                (card) => card.type !== 'discard'
            )

            io.to(code).emit('lobby-updated', lobby)
        }
    )

    socket.on('skip-action', (code: string) => {
        const lobby = lobbies[code]

        if (!lobby) return

        if (!isPlayersTurn(lobby, socket.id)) return

        if (lobby.phase !== 'action-choice') return

        lobby.highlightedCards = lobby.highlightedCards.filter(
            (card) => card.type !== 'discard'
        )

        goToNextPlayer(lobby, code)

        io.to(code).emit('lobby-updated', lobby)
    })

    socket.on('finish-peek-own', (code: string) => {
        const lobby = lobbies[code]

        if (!lobby) return

        finishPeekOwn(lobby, code, socket.id)
    })

    socket.on('finish-peek-opponent', (code: string) => {
        const lobby = lobbies[code]

        if (!lobby) return

        finishPeekOpponent(lobby, code, socket.id)
    })

    socket.on(
        'special-swap',
        ({
            code,
            ownCardIndex,
            opponentId,
            opponentCardIndex,
        }: {
            code: string
            ownCardIndex: number
            opponentId: string
            opponentCardIndex: number
        }
        ) => {
            const lobby = lobbies[code]

            if (!lobby) return

            if (!isPlayersTurn(lobby, socket.id)) return

            if (lobby.phase !== 'special-swap') return

            const me = lobby.players.find(
                (player) => player.id === socket.id
            )

            const opponent = lobby.players.find(
                (player) => player.id === opponentId
            )

            if (!me || !opponent) return

            const myCard = me.cards[ownCardIndex]
            const enemyCard = opponent.cards[opponentCardIndex]

            if (
                myCard === undefined ||
                enemyCard === undefined
            ) {
                return
            }

            lobby.highlightedCards = [
                {
                    playerId: me.id,
                    cardIndex: ownCardIndex,
                    type: 'swap',
                },
                {
                    playerId: opponent.id,
                    cardIndex: opponentCardIndex,
                    type: 'swap',
                },
            ]

            io.to(code).emit('lobby-updated', lobby)

            setTimeout(() => {
                me.cards[ownCardIndex] = enemyCard
                opponent.cards[opponentCardIndex] = myCard

                lobby.highlightedCards = []

                goToNextPlayer(lobby, code)

                io.to(code).emit('lobby-updated', lobby)
            }, 2000)
        }
    )

    socket.on(
        'swap-card',
        ({
            code,
            cardIndex,
        }: {
            code: string
            cardIndex: number
        }) => {
            const lobby = lobbies[code]

            if (!lobby) return

            if (!isPlayersTurn(lobby, socket.id)) return

            const player = lobby.players.find(
                (player) => player.id === socket.id
            )

            if (!player) return

            if (player.drawnCard === null) return

            const oldCard = player.cards[cardIndex]

            if (oldCard === undefined) return

            player.cards[cardIndex] = player.drawnCard

            player.drawnCard = null
            player.drawSource = null

            lobby.discardPile.push(oldCard)
            lobby.discardLocked = false

            lobby.highlightedCards = [
                {
                    playerId: player.id,
                    cardIndex,
                    type: 'swap',
                },
            ]

            io.to(code).emit('lobby-updated', lobby)

            setTimeout(() => {
                lobby.highlightedCards = []

                goToNextPlayer(lobby, code)

                io.to(code).emit('lobby-updated', lobby)
            }, 1200)
        })

    socket.on('call-cabo', (code: string) => {
        const lobby = lobbies[code]

        if (!lobby) return
        if (!isPlayersTurn(lobby, socket.id)) return
        if (lobby.phase !== 'turn') return
        if (lobby.caboCalledBy !== null) return

        lobby.caboCalledBy = socket.id
        lobby.turnsAfterCabo = 0

        lobby.currentPlayer =
            (lobby.currentPlayer + 1) % lobby.players.length

        lobby.phase = 'turn'

        lobby.highlightedCards = lobby.highlightedCards.filter(
            (card) => card.type !== 'discard'
        )

        io.to(code).emit('lobby-updated', lobby)
    })

    socket.on('start-new-game', (code: string) => {
        const lobby = lobbies[code]

        if (!lobby) return
        if (socket.id !== lobby.hostId) return
        if (lobby.phase !== 'game-over') return

        const deck = createDeck()

        lobby.players = lobby.players.map((player, index) => ({
            ...player,
            cards: deck.slice(index * 4, index * 4 + 4),
            ready: false,
            drawnCard: null,
            totalScore: 0,
        }))

        const usedCards = lobby.players.length * 4

        lobby.drawPile = deck.slice(usedCards + 1)
        lobby.discardPile = [deck[usedCards]!]
        lobby.currentPlayer = 0
        lobby.caboCalledBy = null
        lobby.turnsAfterCabo = 0
        lobby.roundScores = []
        lobby.caboPenaltyApplied = false
        lobby.kamikazePlayerId = null
        lobby.phase = 'memorize'
        lobby.discardLocked = false
        lobby.highlightedCards = []
        lobby.memorizedPlayerIds = []

        io.to(code).emit('game-started', lobby)
    })

    socket.on('start-next-round', (code: string) => {
        const lobby = lobbies[code]

        if (!lobby) return
        if (socket.id !== lobby.hostId) return
        if (lobby.phase !== 'round-over') return

        const deck = createDeck()

        lobby.players = lobby.players.map((player, index) => ({
            ...player,
            cards: deck.slice(index * 4, index * 4 + 4),
            ready: false,
            drawnCard: null,
            drawSource: null,
        }))

        const usedCards = lobby.players.length * 4

        lobby.drawPile = deck.slice(usedCards + 1)
        lobby.discardPile = [deck[usedCards]!]
        lobby.discardLocked = false
        lobby.currentPlayer = 0
        lobby.caboCalledBy = null
        lobby.turnsAfterCabo = 0
        lobby.roundScores = []
        lobby.caboPenaltyApplied = false
        lobby.kamikazePlayerId = null
        lobby.phase = 'memorize'
        lobby.highlightedCards = []
        lobby.memorizedPlayerIds = []

        io.to(code).emit('game-started', lobby)
    })

    socket.on('leave-crossword-game', (code: string) => {
        const spielekisteLobby = spielekisteLobbies[code]

        if (!spielekisteLobby) return

        const isHost = spielekisteLobby.hostId === socket.id

        if (isHost) {
            spielekisteLobby.activeGame = null

            delete crosswordGames[code]
            delete crosswordPresence[code]

            io.to(code).emit('game-ended', {
                game: 'crossword',
                code,
            })

            return
        }

        socket.emit('game-left', {
            game: 'crossword',
            code,
        })
    })

    socket.on('leave-nebo-game', (code: string) => {
        const lobby = lobbies[code]
        const spielekisteLobby = spielekisteLobbies[code]

        if (!lobby || !spielekisteLobby) return

        const isHost = spielekisteLobby.hostId === socket.id

        if (isHost) {
            spielekisteLobby.activeGame = null

            lobby.phase = 'lobby'
            lobby.drawPile = []
            lobby.discardPile = []
            lobby.discardLocked = false
            lobby.highlightedCards = []
            lobby.memorizedPlayerIds = []
            lobby.currentPlayer = 0
            lobby.caboCalledBy = null
            lobby.turnsAfterCabo = 0
            lobby.roundScores = []
            lobby.caboPenaltyApplied = false
            lobby.kamikazePlayerId = null

            lobby.players = lobby.players.map((player) => ({
                ...player,
                cards: [],
                ready: false,
                drawnCard: null,
                drawSource: null,
                totalScore: 0,
            }))

            io.to(code).emit('game-ended', {
                game: 'nebo',
                code,
            })

            return
        }

        socket.emit('game-left', {
            game: 'nebo',
            code,
        })
    })

    socket.on('leave-lobby', (code: string) => {
        const lobby = lobbies[code]

        if (!lobby) return

        leaveLobby(lobby, code, socket.id)

        socket.leave(code)
        socket.emit('lobby-left')
    })

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id)
    })
})

httpServer.listen(3001, () => {
    console.log('CABO server running on http://localhost:3001')
})