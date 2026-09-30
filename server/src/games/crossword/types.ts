export type CrosswordClue = {
    clue: string
    answer: string
    direction: 'right' | 'down'
}

export type CrosswordCell =
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

export type CrosswordGameState = {
    puzzleId: string
    entries: Record<string, string>
    completed: boolean
}