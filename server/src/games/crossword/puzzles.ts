import type { CrosswordPuzzle } from './types'

export const testPuzzle: CrosswordPuzzle = {
    id: 'test-1',
    title: 'Mini-Test',
    rows: 5,
    cols: 5,

    cells: [
        // Hinweis für MAUS ↓
        {
            type: 'clue',
            row: 0,
            col: 2,
            clues: [
                {
                    clue: 'Kleines Nagetier',
                    answer: 'MAUS',
                    direction: 'down',
                },
            ],
        },

        // M von MAUS
        { type: 'letter', row: 1, col: 2, solution: 'M' },

        // Hinweis für HAUS →
        {
            type: 'clue',
            row: 2,
            col: 0,
            clues: [
                {
                    clue: 'Gebäude zum Wohnen',
                    answer: 'HAUS',
                    direction: 'right',
                },
            ],
        },

        // HAUS →
        { type: 'letter', row: 2, col: 1, solution: 'H' },
        { type: 'letter', row: 2, col: 2, solution: 'A' },
        { type: 'letter', row: 2, col: 3, solution: 'U' },
        { type: 'letter', row: 2, col: 4, solution: 'S' },

        // Rest von MAUS ↓
        { type: 'letter', row: 3, col: 2, solution: 'U' },
        { type: 'letter', row: 4, col: 2, solution: 'S' },
    ],
}