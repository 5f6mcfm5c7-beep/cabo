import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'

type Player = {
    id: string
    playerId: string
    name: string
    cards: number[]
    ready: boolean
    drawnCard: number | null
    drawSource: 'deck' | 'discard' | null
    totalScore: number
}

type HighlightedCard = {
    playerId: string
    cardIndex: number
    type: 'memorize' | 'peek-own' | 'peek-opponent' | 'swap' | 'discard'
}

type Lobby = {
    code: string
    hostId: string
    players: Player[]
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

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
})

const lobbies: Record<string, Lobby> = {}

function makeLobbyCode() {
    return Math.random().toString(36).substring(2, 7).toUpperCase()
}

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


app.use(cors())

app.get('/', (_req, res) => {
    res.send('CABO server is running 🃏')
})

function isPlayersTurn(lobby: Lobby, socketId: string) {
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

function finishRound(lobby: Lobby) {

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

function advanceTurn(lobby: Lobby, code?: string) {
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

function goToNextPlayer(lobby: Lobby, code?: string) {
    advanceTurn(lobby, code)
}

function reconnectPlayer(lobby: Lobby, oldSocketId: string, newSocketId: string) {
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

function finishMemorizeForPlayer(lobby: Lobby, code: string, socketId: string) {
    if (lobby.phase !== 'memorize') return

    const player = lobby.players.find((player) => player.id === socketId)

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

function finishPeekOwn(lobby: Lobby, code: string, socketId: string) {
    if (!isPlayersTurn(lobby, socketId)) return
    if (lobby.phase !== 'peek-own') return

    lobby.highlightedCards = lobby.highlightedCards.filter(
        (card) => card.type !== 'peek-own'
    )

    goToNextPlayer(lobby, code)

    io.to(code).emit('lobby-updated', lobby)
}

function finishPeekOpponent(lobby: Lobby, code: string, socketId: string) {
    if (!isPlayersTurn(lobby, socketId)) return
    if (lobby.phase !== 'peek-opponent') return

    lobby.highlightedCards = lobby.highlightedCards.filter(
        (card) => card.type !== 'peek-opponent'
    )

    goToNextPlayer(lobby, code)

    io.to(code).emit('lobby-updated', lobby)
}

function finishMemorizeForPersistentPlayer(lobby: Lobby, code: string, persistentPlayerId: string) {
    const player = lobby.players.find((player) => player.playerId === persistentPlayerId)

    if (!player) return

    finishMemorizeForPlayer(lobby, code, player.id)
}

function finishPeekOwnForPersistentPlayer(lobby: Lobby, code: string, persistentPlayerId: string) {
    const player = lobby.players.find((player) => player.playerId === persistentPlayerId)

    if (!player) return

    finishPeekOwn(lobby, code, player.id)
}

function finishPeekOpponentForPersistentPlayer(lobby: Lobby, code: string, persistentPlayerId: string) {
    const player = lobby.players.find((player) => player.playerId === persistentPlayerId)

    if (!player) return

    finishPeekOpponent(lobby, code, player.id)
}

function leaveLobby(lobby: Lobby, code: string, socketId: string) {
    const leavingPlayerIndex = lobby.players.findIndex(
        (player) => player.id === socketId
    )

    if (leavingPlayerIndex === -1) return

    lobby.players = lobby.players.filter(
        (player) => player.id !== socketId
    )

    lobby.highlightedCards = lobby.highlightedCards.filter(
        (card) => card.playerId !== socketId
    )

    if (lobby.players.length === 0) {
        delete lobbies[code]
        return
    }

    if (lobby.hostId === socketId) {
        lobby.hostId = lobby.players[0]!.id
    }

    if (lobby.currentPlayer >= lobby.players.length) {
        lobby.currentPlayer = 0
    }

    io.to(code).emit('lobby-updated', lobby)
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

            const lobby: Lobby = {
                code,
                hostId: socket.id,
                players: [
                    {
                        id: socket.id,
                        playerId,
                        name: playerName,
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
            socket.join(code)

            socket.emit('lobby-created', lobby)
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
                socket.emit('lobby-error', 'Lobby nicht gefunden.')
                return
            }

            const existingPlayer = lobby.players.find(
                (player) => player.playerId === playerId
            )

            if (existingPlayer) {
                const oldSocketId = existingPlayer.id

                reconnectPlayer(lobby, oldSocketId, socket.id)

                const reconnectedPlayer = lobby.players.find(
                    (player) => player.playerId === playerId
                )

                if (reconnectedPlayer) {
                    reconnectedPlayer.name = playerName
                }

                socket.join(code)
                socket.emit('lobby-created', lobby)
                io.to(code).emit('lobby-updated', lobby)
                return
            }

            if (lobby.players.length >= 5) {
                socket.emit('lobby-error', 'Diese Lobby ist bereits voll.')
                return
            }

            lobby.players.push({
                id: socket.id,
                playerId,
                name: playerName,
                cards: [],
                ready: false,
                drawnCard: null,
                drawSource: null,
                totalScore: 0,
            })

            socket.join(code)

            io.to(code).emit('lobby-updated', lobby)
        })

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

        console.log('DISCARD DELAY TEST', discardedCard)

        lobby.discardPile.push(discardedCard)
        lobby.discardLocked = false

        player.drawnCard = null
        player.drawSource = null

        lobby.highlightedCards = [
            {
                playerId: 'discard-pile',
                cardIndex: -1,
                type: 'discard',
            },
        ]

        io.to(code).emit('lobby-updated', lobby)

        setTimeout(() => {
            lobby.highlightedCards = []

            if (
                discardedCard === 7 ||
                discardedCard === 8 ||
                discardedCard === 9 ||
                discardedCard === 10 ||
                discardedCard === 11 ||
                discardedCard === 12
            ) {
                lobby.phase = 'action-choice'
            } else {
                goToNextPlayer(lobby, code)
            }

            io.to(code).emit('lobby-updated', lobby)
        }, 1200)
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

            io.to(code).emit('lobby-updated', lobby)
        }
    )

    socket.on('skip-action', (code: string) => {
        const lobby = lobbies[code]

        if (!lobby) return

        if (!isPlayersTurn(lobby, socket.id)) return

        if (lobby.phase !== 'action-choice') return

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

            console.log('SWAP DELAY TEST', cardIndex)

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
        }
    )

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

    socket.on('leave-lobby', (code: string) => {
        const lobby = lobbies[code]

        if (!lobby) return

        socket.leave(code)

        if (lobby.phase === 'lobby') {
            leaveLobby(lobby, code, socket.id)
        }

        socket.emit('lobby-left')
    })

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id)
    })
})

httpServer.listen(3001, () => {
    console.log('CABO server running on http://localhost:3001')
})