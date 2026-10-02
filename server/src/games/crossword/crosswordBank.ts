import rawBank from '../../../data/crossword/crossword-bank-selected.json'
import type { CrosswordBankEntry } from './generator'

export const crosswordBank: CrosswordBankEntry[] = rawBank.map(
    (entry) => ({
        id: entry.id,
        word: entry.word,
        clue: entry.clue,
    })
)