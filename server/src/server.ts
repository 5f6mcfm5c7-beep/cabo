import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'

type Player = {
    id: string
    name: string
    cards: number[]
    ready: boolean
    drawnCard: number | null
}

type Lobby = {
    code: string
    hostId: string
    players: Player[]
    drawPile: number[]
    discardPile: number[]
    currentPlayer: number
    phase: 'lobby' | 'memorize' | 'turn'
}

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
    cors: {
        origin: 'http://localhost:5173',
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

app.use(cors())

app.get('/', (_req, res) => {
    res.send('CABO server is running 🃏')
})

function isPlayersTurn(lobby: Lobby, socketId: string) {
    return lobby.players[lobby.currentPlayer]?.id === socketId
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id)

    socket.on('create-lobby', (playerName: string) => {

        console.log('Create lobby request from:', playerName)

        const code = makeLobbyCode()

        const lobby: Lobby = {
            code,
            hostId: socket.id,
            players: [
                {
                    id: socket.id,
                    name: playerName,
                    cards: [],
                    ready: false,
                    drawnCard: null,
                }
            ],
            drawPile: [],
            discardPile: [],
            currentPlayer: 0,
            phase: 'lobby',
        }
        lobbies[code] = lobby
        socket.join(code)

        socket.emit('lobby-created', lobby)
    })

    socket.on(
        'join-lobby',
        ({ code, playerName }: { code: string; playerName: string }) => {
            const lobby = lobbies[code]

            if (!lobby) {
                socket.emit('lobby-error', 'Lobby nicht gefunden.')
                return
            }

            lobby.players.push({
                id: socket.id,
                name: playerName,
                cards: [],
                ready: false,
                drawnCard: null,
            })

            socket.join(code)

            io.to(code).emit('lobby-updated', lobby)
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
        }))

        const usedCards = lobby.players.length * 4

        lobby.drawPile = deck.slice(usedCards + 1)
        lobby.discardPile = [deck[usedCards]!]
        lobby.currentPlayer = 0
        lobby.phase = 'memorize'

        console.log('GAME STARTED')
        console.log(lobby.players)

        io.to(code).emit('game-started', lobby)
    })

    socket.on('start-cards-done', (code: string) => {
        const lobby = lobbies[code]

        if (!lobby) return

        const player = lobby.players.find((player) => player.id === socket.id)

        if (!player) return

        player.ready = true

        const allReady = lobby.players.every((player) => player.ready)

        if (allReady) {
            lobby.phase = 'turn'
            lobby.currentPlayer = 0
        }

        io.to(code).emit('lobby-updated', lobby)
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
        }

        lobby.currentPlayer =
            (lobby.currentPlayer + 1) % lobby.players.length

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
            console.log('DRAWPILE EMPTY')
            return
        }

        const card = lobby.drawPile.shift()

        if (card === undefined) {
            console.log('CARD UNDEFINED')
            return
        }

        console.log('CARD DRAWN:', card)

        player.drawnCard = card

        socket.emit('draw-card-result', card)

        io.to(code).emit('lobby-updated', lobby)
    })

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id)
    })
})

httpServer.listen(3001, () => {
    console.log('CABO server running on http://localhost:3001')
})