import type { CrosswordPuzzle } from './types'

import level001 from '../../../data/crossword/puzzles/crossword-001.json'
import level002 from '../../../data/crossword/puzzles/crossword-002.json'
import level003 from '../../../data/crossword/puzzles/crossword-003.json'
import level004 from '../../../data/crossword/puzzles/crossword-004.json'
import level005 from '../../../data/crossword/puzzles/crossword-005.json'
import level006 from '../../../data/crossword/puzzles/crossword-006.json'
import level007 from '../../../data/crossword/puzzles/crossword-007.json'
import level008 from '../../../data/crossword/puzzles/crossword-008.json'
import level009 from '../../../data/crossword/puzzles/crossword-009.json'
import level010 from '../../../data/crossword/puzzles/crossword-010.json'
import level011 from '../../../data/crossword/puzzles/crossword-011.json'
import level012 from '../../../data/crossword/puzzles/crossword-012.json'
import level013 from '../../../data/crossword/puzzles/crossword-013.json'
import level014 from '../../../data/crossword/puzzles/crossword-014.json'
import level015 from '../../../data/crossword/puzzles/crossword-015.json'

export type CrosswordDifficulty = 'easy' | 'medium' | 'hard'

export type CrosswordLevel = {
    id: string
    level: number
    difficulty: CrosswordDifficulty
    title: string
    puzzle: CrosswordPuzzle
}

export const crosswordLevels: CrosswordLevel[] = [
    level001,
    level002,
    level003,
    level004,
    level005,
    level006,
    level007,
    level008,
    level009,
    level010,
    level011,
    level012,
    level013,
    level014,
    level015,
] as CrosswordLevel[]

export const getCrosswordLevel = (
    id: string
): CrosswordLevel | undefined => {
    return crosswordLevels.find((level) => level.id === id)
}

export const getCrosswordLevelByNumber = (
    levelNumber: number
): CrosswordLevel | undefined => {
    return crosswordLevels.find(
        (level) => level.level === levelNumber
    )
}

export const getCrosswordPuzzle = (
    id: string
): CrosswordPuzzle | undefined => {
    return getCrosswordLevel(id)?.puzzle
}

/*
 * Noch temporär:
 * server.ts verwendet aktuell testPuzzle.
 * Im nächsten Schritt ersetzen wir diese Stellen durch das gewählte Level.
 */
export const testPuzzle = crosswordLevels[0]!.puzzle