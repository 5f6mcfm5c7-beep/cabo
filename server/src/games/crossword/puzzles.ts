import { crosswordBank } from './crosswordBank'
import { generateCrossword } from './generator'

export const testPuzzle = generateCrossword(
    crosswordBank,
    {
        rows: 15,
        cols: 15,
        targetWords: 18,
    }
)