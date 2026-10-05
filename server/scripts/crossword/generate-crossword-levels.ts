import fs from 'node:fs'
import path from 'node:path'

import { crosswordBank } from '../../src/games/crossword/crosswordBank'
import { generateCrossword } from '../../src/games/crossword/generator'

const OUTPUT_DIR = path.resolve(
    __dirname,
    '../../data/crossword/puzzles'
)

const LEVEL_COUNT = 15

fs.mkdirSync(OUTPUT_DIR, { recursive: true })

for (let level = 1; level <= LEVEL_COUNT; level++) {
    console.log(`\n=== Generiere Crossword Level ${level}/${LEVEL_COUNT} ===`)

    const puzzle = generateCrossword(crosswordBank, {
        rows: 15,
        cols: 15,
        targetWords: 18,
        seed: level,
    })

    const id = `crossword-${String(level).padStart(3, '0')}`

    const levelData = {
        id,
        level,
        difficulty: 'easy',
        title: `Rätsel ${level}`,
        puzzle: {
            ...puzzle,
            id,
            title: `Rätsel ${level}`,
        },
    }

    const outputPath = path.join(
        OUTPUT_DIR,
        `${id}.json`
    )

    fs.writeFileSync(
        outputPath,
        JSON.stringify(levelData, null, 2),
        'utf8'
    )

    console.log(`✓ ${id} gespeichert`)
}

console.log('\n================================')
console.log(`${LEVEL_COUNT} Crossword-Level fertig.`)
console.log(`Ordner: ${OUTPUT_DIR}`)
console.log('================================')