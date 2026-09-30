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

function CrosswordGame({ onBack, lobbyCode }: CrosswordGameProps) {
    const [puzzle, setPuzzle] = useState<CrosswordPuzzle | null>(null)
    const [game, setGame] = useState<CrosswordGameState | null>(null)

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

        socket.on('crossword-updated', handleCrosswordUpdated)
        socket.emit('get-crossword-game', lobbyCode)

        return () => {
            socket.off('crossword-updated', handleCrosswordUpdated)
        }
    }, [lobbyCode])

    const handleCellChange = (row: number, col: number, value: string) => {
        if (!lobbyCode) return

        socket.emit('update-crossword-cell', {
            code: lobbyCode,
            row,
            col,
            value,
        })
    }

    return (
        <main className="page">
            <section className="card hero">
                <button className="backButton" onClick={onBack}>
                    ← Zurück zur Spielekiste
                </button>

                <p className="eyebrow">Online-Coop</p>
                <h1>Kreuzworträtsel 🧩</h1>

                {puzzle && game ? (
                    <>
                        <p className="subtitle">{puzzle.title}</p>

                        <div
                            className="crosswordGrid"
                            style={{
                                gridTemplateColumns: `repeat(${puzzle.cols}, 48px)`,
                                gridTemplateRows: `repeat(${puzzle.rows}, 48px)`,
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

                                return (
                                    <input
                                        key={key}
                                        className="crosswordCell crosswordCellInput"
                                        value={game.entries[key] ?? ''}
                                        maxLength={1}
                                        onChange={(event) =>
                                            handleCellChange(row, col, event.target.value)
                                        }
                                    />
                                )
                            })}


                        </div>
                    </>
                ) : (
                    <p className="subtitle">Rätsel wird geladen...</p>
                )}
            </section>
        </main >
    )
}

export default CrosswordGame