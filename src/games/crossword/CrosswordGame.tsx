import { useEffect, useState } from 'react'
import { socket } from '../../socket'

type CrosswordGameProps = {
    onBack: () => void
    lobbyCode: string | null
}

type CrosswordClue = {
    clue: string
    answer: string
    direction: 'right' | 'down'
}

type CrosswordCell =
    | {
        type: 'letter'
        row: number
        col: number
        solution: string
    }
    | {
        type: 'clue'
        row: number
        col: number
        clues: CrosswordClue[]
    }

type CrosswordPuzzle = {
    id: string
    title: string
    rows: number
    cols: number
    cells: CrosswordCell[]
}

type CrosswordGameState = {
    puzzleId: string
    entries: Record<string, string>
    completed: boolean
}

type CrosswordPresence = {
    playerId: string
    name: string
    row: number
    col: number
    direction: 'right' | 'down'
}

function CrosswordGame({ onBack, lobbyCode }: CrosswordGameProps) {
    const [puzzle, setPuzzle] = useState<CrosswordPuzzle | null>(null)
    const [game, setGame] = useState<CrosswordGameState | null>(null)

    const [otherPlayers, setOtherPlayers] = useState<CrosswordPresence[]>([])

    const [activeCell, setActiveCell] = useState<{
        row: number
        col: number
    } | null>(null)

    const [activeDirection, setActiveDirection] = useState<'right' | 'down' | null>(null)

    useEffect(() => {
        if (!lobbyCode) return

        const handleCrosswordUpdated = ({
            puzzle,
            game,
        }: {
            puzzle: CrosswordPuzzle
            game: CrosswordGameState
        }) => {
            setPuzzle(puzzle)
            setGame(game)
        }

        const handlePresenceUpdated = (presence: CrosswordPresence[]) => {
            setOtherPlayers(presence)
        }

        socket.on('crossword-updated', handleCrosswordUpdated)
        socket.on('crossword-presence-updated', handlePresenceUpdated)

        socket.emit('get-crossword-game', lobbyCode)

        return () => {
            socket.off('crossword-updated', handleCrosswordUpdated)
            socket.off('crossword-presence-updated', handlePresenceUpdated)
        }
    }, [lobbyCode])

    const updateCell = (row: number, col: number, value: string) => {
        if (!lobbyCode) return

        socket.emit('update-crossword-cell', {
            code: lobbyCode,
            row,
            col,
            value,
        })
    }

    const getDirectionsForCell = (row: number, col: number) => {
        if (!puzzle) return []

        const directions: ('right' | 'down')[] = []

        for (const cell of puzzle.cells) {
            if (cell.type !== 'clue') continue

            for (const clue of cell.clues) {
                if (clue.direction === 'right') {
                    const startCol = cell.col + 1

                    if (
                        row === cell.row &&
                        col >= startCol &&
                        col < startCol + clue.answer.length
                    ) {
                        directions.push('right')
                    }
                }

                if (clue.direction === 'down') {
                    const startRow = cell.row + 1

                    if (
                        col === cell.col &&
                        row >= startRow &&
                        row < startRow + clue.answer.length
                    ) {
                        directions.push('down')
                    }
                }
            }
        }

        return directions
    }

    const handleCellClick = (row: number, col: number) => {
        const directions = getDirectionsForCell(row, col)

        if (directions.length === 0) return

        const isSameCell =
            activeCell?.row === row && activeCell?.col === col

        let nextDirection: 'right' | 'down'

        if (
            isSameCell &&
            directions.length === 2 &&
            activeDirection &&
            directions.includes(activeDirection)
        ) {
            nextDirection = activeDirection === 'right' ? 'down' : 'right'
        } else if (directions.includes('right')) {
            nextDirection = 'right'
        } else {
            nextDirection = 'down'
        }

        setActiveCell({ row, col })
        setActiveDirection(nextDirection)

        if (lobbyCode) {
            socket.emit('update-crossword-presence', {
                code: lobbyCode,
                row,
                col,
                direction: nextDirection,
            })
        }
    }

    const getActiveWordCells = () => {
        if (!puzzle || !activeCell || !activeDirection) return []

        for (const cell of puzzle.cells) {
            if (cell.type !== 'clue') continue

            for (const clue of cell.clues) {
                if (clue.direction !== activeDirection) continue

                const wordCells = Array.from(
                    { length: clue.answer.length },
                    (_, index) => ({
                        row:
                            clue.direction === 'down'
                                ? cell.row + 1 + index
                                : cell.row,
                        col:
                            clue.direction === 'right'
                                ? cell.col + 1 + index
                                : cell.col,
                    })
                )

                const containsActiveCell = wordCells.some(
                    (wordCell) =>
                        wordCell.row === activeCell.row &&
                        wordCell.col === activeCell.col
                )

                if (containsActiveCell) {
                    return wordCells
                }
            }
        }

        return []
    }

    const activeWordCells = getActiveWordCells()

    const isActiveWordCell = (row: number, col: number) =>
        activeWordCells.some(
            (cell) => cell.row === row && cell.col === col
        )

    const getWordCellsForPresence = (presence: CrosswordPresence) => {
        if (!puzzle) return []

        for (const cell of puzzle.cells) {
            if (cell.type !== 'clue') continue

            for (const clue of cell.clues) {
                if (clue.direction !== presence.direction) continue

                const wordCells = Array.from(
                    { length: clue.answer.length },
                    (_, index) => ({
                        row:
                            clue.direction === 'down'
                                ? cell.row + 1 + index
                                : cell.row,
                        col:
                            clue.direction === 'right'
                                ? cell.col + 1 + index
                                : cell.col,
                    })
                )

                const containsPlayerCell = wordCells.some(
                    (wordCell) =>
                        wordCell.row === presence.row &&
                        wordCell.col === presence.col
                )

                if (containsPlayerCell) {
                    return wordCells
                }
            }
        }

        return []
    }

    const getOtherPlayerOnCell = (row: number, col: number) => {
        return otherPlayers.find((player) =>
            getWordCellsForPresence(player).some(
                (cell) => cell.row === row && cell.col === col
            )
        )
    }

    const getOtherPlayerActiveCell = (row: number, col: number) => {
        return otherPlayers.find(
            (player) =>
                player.row === row &&
                player.col === col
        )
    }

    const focusCell = (row: number, col: number) => {
        const input = document.querySelector<HTMLInputElement>(
            `[data-crossword-cell="${row}-${col}"]`
        )

        input?.focus()
    }

    const moveToNextCell = (row: number, col: number) => {
        const currentIndex = activeWordCells.findIndex(
            (cell) => cell.row === row && cell.col === col
        )

        if (currentIndex === -1) return

        const nextCell = activeWordCells
            .slice(currentIndex + 1)
            .find((cell) => {
                const key = `${cell.row}-${cell.col}`
                return !game?.entries[key]
            })

        if (!nextCell) return

        setActiveCell(nextCell)

        requestAnimationFrame(() => {
            focusCell(nextCell.row, nextCell.col)
        })
    }

    const handleCellKeyDown = (
        event: React.KeyboardEvent<HTMLInputElement>,
        row: number,
        col: number
    ) => {
        const key = `${row}-${col}`

        if (event.key === 'Backspace') {
            event.preventDefault()

            if (game?.entries[key]) {
                updateCell(row, col, '')
                return
            }

            const currentIndex = activeWordCells.findIndex(
                (cell) => cell.row === row && cell.col === col
            )

            const previousCell = activeWordCells[currentIndex - 1]

            if (!previousCell) return

            const previousKey = `${previousCell.row}-${previousCell.col}`

            setActiveCell(previousCell)

            if (game?.entries[previousKey]) {
                updateCell(previousCell.row, previousCell.col, '')
            }

            requestAnimationFrame(() => {
                focusCell(previousCell.row, previousCell.col)
            })

            return
        }

        if (/^[a-zA-ZäöüÄÖÜß]$/.test(event.key)) {
            event.preventDefault()

            const letter = event.key.toUpperCase()

            updateCell(row, col, letter)
            moveToNextCell(row, col)
        }
    }

    return (
        <main className="crosswordGamePage">
            {puzzle && game ? (
                <div className="crosswordGameBoard">
                    <div
                        className="crosswordGrid"
                        style={{
                            gridTemplateColumns: `repeat(${puzzle.cols}, 72px)`,
                            gridTemplateRows: `repeat(${puzzle.rows}, 72px)`,
                        }}
                    >
                        {Array.from({ length: puzzle.rows * puzzle.cols }).map((_, index) => {
                            const row = Math.floor(index / puzzle.cols)
                            const col = index % puzzle.cols

                            const cell = puzzle.cells.find(
                                (cell) => cell.row === row && cell.col === col
                            )

                            const key = `${row}-${col}`

                            if (!cell) {
                                return (
                                    <div
                                        key={key}
                                        className="crosswordCell crosswordCellBlocked"
                                    />
                                )
                            }

                            if (cell.type === 'clue') {
                                return (
                                    <div
                                        key={key}
                                        className="crosswordCell crosswordClueCell"
                                    >
                                        {cell.clues.map((clue, clueIndex) => (
                                            <div
                                                key={`${key}-${clueIndex}`}
                                                className="crosswordClueCellText"
                                            >
                                                <span>{clue.clue}</span>
                                                <strong>
                                                    {clue.direction === 'right' ? '→' : '↓'}
                                                </strong>
                                            </div>
                                        ))}
                                    </div>
                                )
                            }

                            const otherPlayer = getOtherPlayerOnCell(row, col)
                            const otherPlayerActive = getOtherPlayerActiveCell(row, col)

                            return (
                                <div
                                    key={key}
                                    className="crosswordCellWrapper"
                                >
                                    {otherPlayerActive && (
                                        <span className="crosswordPlayerName">
                                            {otherPlayerActive.name}
                                        </span>
                                    )}

                                    <input
                                        data-crossword-cell={key}
                                        className={`crosswordCell crosswordCellInput ${isActiveWordCell(row, col)
                                                ? 'crosswordCellWordActive'
                                                : ''
                                            } ${activeCell?.row === row && activeCell?.col === col
                                                ? 'crosswordCellSelected'
                                                : ''
                                            } ${otherPlayer
                                                ? 'crosswordCellOtherPlayer'
                                                : ''
                                            } ${otherPlayerActive
                                                ? 'crosswordCellOtherPlayerSelected'
                                                : ''
                                            }`}
                                        value={game.entries[key] ?? ''}
                                        maxLength={1}
                                        readOnly
                                        onClick={() => handleCellClick(row, col)}
                                        onKeyDown={(event) =>
                                            handleCellKeyDown(event, row, col)
                                        }
                                    />
                                </div>
                            )
                        })}
                    </div>
                </div>
            ) : (
                <p>Rätsel wird geladen...</p>
            )}

            <button
                className="crosswordBackButton"
                onClick={onBack}
            >
                ← Zurück zur Lobby
            </button>
        </main>
    )
}

export default CrosswordGame