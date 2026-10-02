import { getEntries } from 'open-crossword-bank'
import { writeFile } from 'node:fs/promises'

const entries = []

for (let length = 3; length <= 12; length++) {
    const results = await getEntries('de', {
        length,
        tier: [1, 2],
        maxClueDifficulty: 3,
        count: 5000,
        seed: 42 + length,
    })

    entries.push(...results)
}

await writeFile(
    'data/crossword-bank-raw.json',
    JSON.stringify(entries, null, 2),
    'utf8'
)

console.log(`Exportiert: ${entries.length} Einträge`)