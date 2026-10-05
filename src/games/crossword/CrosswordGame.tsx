import { useEffect, useState } from 'react'
import { socket } from '../../socket'

type CrosswordGameProps = {
    onBack: () => void
    lobbyCode: string | null
    isHost: boolean
    localPuzzle?: CrosswordPuzzle
    localSave?: {
        entries: Record<string, string>
        revealedCells: string[]
    }
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

export type CrosswordPuzzle = {
    id: string
    title: string
    rows: number
    cols: number
    cells: CrosswordCell[]
}

type CrosswordGameState = {
    puzzleId: string
    entries: Record<string, string>
    revealedCells: string[]
    completed: boolean
}

type CrosswordPresence = {
    playerId: string
    name: string
    row: number
    col: number
    direction: 'right' | 'down'
}

type SpielekisteLobbyInfo = {
    code: string
    hostId: string
    activeGame: 'nebo' | 'crossword' | null
    players: {
        id: string
        playerId: string
        name: string
    }[]
}

function CrosswordGame({
    onBack,
    lobbyCode,
    isHost,
    localPuzzle,
    localSave,
}: CrosswordGameProps) {
    const [puzzle, setPuzzle] = useState<CrosswordPuzzle | null>(null)
    const [game, setGame] = useState<CrosswordGameState | null>(null)
    const [showFullPuzzle, setShowFullPuzzle] = useState(false)

    const [showErrors, setShowErrors] = useState(false)

    const [isConfirmingLeave, setIsConfirmingLeave] = useState(false)

    const [lobbyInfo, setLobbyInfo] = useState<SpielekisteLobbyInfo | null>(null)

    const [otherPlayers, setOtherPlayers] = useState<CrosswordPresence[]>([])

    const [activeCell, setActiveCell] = useState<{
        row: number
        col: number
    } | null>(null)

    const [activeDirection, setActiveDirection] = useState<'right' | 'down' | null>(null)

    useEffect(() => {
        if (!localPuzzle || lobbyCode) return

        setPuzzle(localPuzzle)
        setGame({
            puzzleId: localPuzzle.id,
            entries: localSave?.entries ?? {},
            revealedCells: localSave?.revealedCells ?? [],
            completed: false,
        })
    }, [localPuzzle, localSave, lobbyCode])

    useEffect(() => {

        const handleCrosswordUpdated = ({
            puzzle,
            game,
        }: {
            puzzle: CrosswordPuzzle
            game: CrosswordGameState
        }) => {
            setPuzzle(puzzle)
            setGame(game)

            if (isHost) {
                localStorage.setItem(
                    `crossword-save-${puzzle.id}`,
                    JSON.stringify({
                        entries: game.entries,
                        revealedCells: game.revealedCells,
                    })
                )
            }
        }

        const handlePresenceUpdated = (presence: CrosswordPresence[]) => {
            setOtherPlayers(presence)
        }

        const handleLobbyClosed = () => {
            onBack()
        }

        const handleLobbyUpdated = (lobby: SpielekisteLobbyInfo) => {
            if (lobby.code === lobbyCode) {
                setLobbyInfo(lobby)
            }
        }

        socket.on('crossword-updated', handleCrosswordUpdated)
        socket.on('crossword-presence-updated', handlePresenceUpdated)
        socket.on('lobby-closed', handleLobbyClosed)
        socket.on('spielekiste-lobby-updated', handleLobbyUpdated)


        if (lobbyCode) {
            socket.emit('get-spielekiste-lobby', lobbyCode)
        }

        socket.emit('get-crossword-game', lobbyCode)

        return () => {
            socket.off('crossword-updated', handleCrosswordUpdated)
            socket.off('crossword-presence-updated', handlePresenceUpdated)
            socket.off('lobby-closed', handleLobbyClosed)
            socket.off('lobby-updated', handleLobbyUpdated)
        }
    }, [lobbyCode, isHost, onBack])

    const updateCell = (row: number, col: number, value: string) => {
        if (lobbyCode) {
            socket.emit('update-crossword-cell', {
                code: lobbyCode,
                row,
                col,
                value,
            })
            return
        }

        if (!puzzle || !game) return

        const key = `${row}-${col}`

        if (game.revealedCells.includes(key)) return

        const nextGame = {
            ...game,
            entries: {
                ...game.entries,
                [key]: value,
            },
        }

        setGame(nextGame)

        localStorage.setItem(
            `crossword-save-${puzzle.id}`,
            JSON.stringify({
                entries: nextGame.entries,
                revealedCells: nextGame.revealedCells,
            })
        )
    }

    const revealActiveCell = () => {

        if (!activeCell) {
            window.alert('Wähle zuerst einen Buchstaben im Rätsel aus.')
            return
        }

        const key = `${activeCell.row}-${activeCell.col}`

        if (game?.revealedCells.includes(key)) {
            window.alert('Dieser Buchstabe wurde bereits aufgedeckt.')
            return
        }

        const confirmed = window.confirm(
            'Möchtest du diesen Buchstaben wirklich aufdecken?'
        )

        if (!confirmed) return

        if (lobbyCode) {
            socket.emit('reveal-crossword-cell', {
                code: lobbyCode,
                row: activeCell.row,
                col: activeCell.col,
            })
            return
        }

        if (!puzzle || !game) return

        const cell = puzzle.cells.find(
            (cell) =>
                cell.type === 'letter' &&
                cell.row === activeCell.row &&
                cell.col === activeCell.col
        )

        if (!cell || cell.type !== 'letter') return

        const nextGame = {
            ...game,
            entries: {
                ...game.entries,
                [key]: cell.solution,
            },
            revealedCells: [
                ...game.revealedCells,
                key,
            ],
        }

        setGame(nextGame)

        localStorage.setItem(
            `crossword-save-${puzzle.id}`,
            JSON.stringify({
                entries: nextGame.entries,
                revealedCells: nextGame.revealedCells,
            })
        )
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

        setShowErrors(false)

        const directions = getDirectionsForCell(row, col)

        if (directions.length === 0) return

        const isSameCell =
            activeCell?.row === row && activeCell?.col === col

        const isInCurrentWord = activeWordCells.some(
            (cell) => cell.row === row && cell.col === col
        )

        let nextDirection: 'right' | 'down'

        if (
            isSameCell &&
            directions.length === 2 &&
            activeDirection &&
            directions.includes(activeDirection)
        ) {
            // Nur erneuter Klick auf DIESELBE Kreuzungszelle wechselt die Richtung
            nextDirection = activeDirection === 'right' ? 'down' : 'right'
        } else if (
            isInCurrentWord &&
            activeDirection &&
            directions.includes(activeDirection)
        ) {
            // Klick auf eine andere Zelle des aktuellen Wortes behält die Richtung
            nextDirection = activeDirection
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
        setShowErrors(false)
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

        if (/^[a-zA-Z]$/.test(event.key)) {
            event.preventDefault()

            const letter = event.key.toUpperCase()

            updateCell(row, col, letter)
            moveToNextCell(row, col)
        }
    }

    const normalCellSize = 82

    const fullPuzzleCellSize = puzzle
        ? Math.min(
            normalCellSize,
            Math.floor((window.innerWidth - 16) / puzzle.cols),
            Math.floor((window.innerHeight - 170) / puzzle.rows)
        )
        : normalCellSize

    const cellSize = showFullPuzzle
        ? fullPuzzleCellSize
        : normalCellSize

    return (
        <main className="crosswordGamePage">
            {puzzle && game ? (
                <>
                    <div className="crosswordToolbar">
                        <button
                            type="button"
                            className={`crosswordToolButton ${showFullPuzzle ? 'crosswordToolButtonActive' : ''}`}
                            onClick={() => setShowFullPuzzle((current) => !current)}
                        >
                            <span className="crosswordToolIcon">⊡</span>
                            <span>
                                {showFullPuzzle ? 'Normalansicht' : 'Ganzes Rätsel'}
                            </span>
                        </button>

                        <button
                            type="button"
                            className="crosswordToolButton"
                            onClick={revealActiveCell}
                        >
                            <span className="crosswordToolIcon">💡</span>
                            <span>Buchstabe</span>
                        </button>

                        <button
                            type="button"
                            className="crosswordToolButton"
                            onClick={() => setShowErrors(true)}
                        >
                            <span className="crosswordToolIcon">✓</span>
                            <span>Fehler</span>
                        </button>
                    </div>

                    <div className="crosswordScrollArea">
                        <div
                            className="crosswordGrid"
                            style={{
                                gridTemplateColumns: `repeat(${puzzle.cols}, ${cellSize}px)`,
                                gridTemplateRows: `repeat(${puzzle.rows}, ${cellSize}px)`,
                                '--crossword-cell-size': `${cellSize}px`,
                            } as React.CSSProperties}
                        >
                            {Array.from({ length: puzzle.rows * puzzle.cols }).map((_, index) => {
                                const row = Math.floor(index / puzzle.cols)
                                const col = index % puzzle.cols

                                const cell = puzzle.cells.find(
                                    (cell) => cell.row === row && cell.col === col
                                )

                                const key = `${row}-${col}`

                                const enteredLetter = game.entries[key] ?? ''

                                const isWrong =
                                    showErrors &&
                                    cell?.type === 'letter' &&
                                    enteredLetter !== '' &&
                                    enteredLetter !== cell.solution &&
                                    !game.revealedCells.includes(key)

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
                                                    data-direction={clue.direction}
                                                    onPointerDown={(event) => {
                                                        if (event.pointerType === 'mouse') return

                                                        const tooltip =
                                                            event.currentTarget.querySelector<HTMLElement>(
                                                                '.crosswordClueTooltip'
                                                            )

                                                        if (tooltip) {
                                                            tooltip.style.opacity = '1'
                                                            tooltip.style.visibility = 'visible'
                                                        }
                                                    }}
                                                    onPointerUp={(event) => {
                                                        if (event.pointerType === 'mouse') return

                                                        const tooltip =
                                                            event.currentTarget.querySelector<HTMLElement>(
                                                                '.crosswordClueTooltip'
                                                            )

                                                        if (tooltip) {
                                                            tooltip.style.opacity = '0'
                                                            tooltip.style.visibility = 'hidden'
                                                        }
                                                    }}
                                                    onPointerCancel={(event) => {
                                                        const tooltip =
                                                            event.currentTarget.querySelector<HTMLElement>(
                                                                '.crosswordClueTooltip'
                                                            )

                                                        if (tooltip) {
                                                            tooltip.style.opacity = '0'
                                                            tooltip.style.visibility = 'hidden'
                                                        }
                                                    }}
                                                >


                                                    <span>{clue.clue}</span>

                                                    <strong>
                                                        {clue.direction === 'right' ? '→' : '↓'}
                                                    </strong>

                                                    <div className="crosswordClueTooltip">
                                                        {clue.clue}
                                                        <strong>
                                                            {clue.direction === 'right' ? ' →' : ' ↓'}
                                                        </strong>
                                                    </div>
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
                                                } ${game.revealedCells.includes(key)
                                                    ? 'crosswordCellRevealed'
                                                    : ''
                                                }
                                                ${isWrong
                                                    ? 'crosswordCellWrong'
                                                    : ''
                                                }`}
                                            value={game.entries[key] ?? ''}
                                            maxLength={1}
                                            autoComplete="off"
                                            autoCorrect="off"
                                            autoCapitalize="characters"
                                            spellCheck={false}
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
                </>
            ) : (
                <p>Rätsel wird geladen...</p>
            )
            }

            {lobbyCode && lobbyInfo ? (
                <div className="lobbyDetailsBar">
                    <span>
                        Lobby-Code: <strong>{lobbyInfo.code}</strong>
                    </span>

                    <span>
                        Spieler: {lobbyInfo.players.length}/5
                    </span>

                    <span>
                        Du bist:{' '}
                        {lobbyInfo.players.find(
                            (player) => player.id === socket.id
                        )?.name ?? 'Spieler'}
                    </span>

                    <button
                        className="dangerButton leaveLobbyButton"
                        onClick={() => {
                            if (!isConfirmingLeave) {
                                setIsConfirmingLeave(true)

                                window.setTimeout(() => {
                                    setIsConfirmingLeave(false)
                                }, 5000)

                                return
                            }

                            socket.emit('leave-crossword-game', lobbyCode)
                            setIsConfirmingLeave(false)
                        }}
                    >
                        {isConfirmingLeave
                            ? 'Wirklich zurück zur Lobby?'
                            : '← Zurück zur Lobby'}
                    </button>
                </div>
            ) : !lobbyCode ? (
                <button
                    className="crosswordBackButton dangerButton"
                    onClick={onBack}
                >
                    ← Zurück zur Levelauswahl
                </button>
            ) : null}
        </main >
    )
}

export default CrosswordGame