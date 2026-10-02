import { getEntries } from 'open-crossword-bank'

const entries = []

for (let length = 3; length <= 10; length++) {
    const results = await getEntries('de', {
        length,
        tier: [1, 2],
        clueType: 'definition',
        maxClueDifficulty: 3,
        count: 100,
        seed: 42 + length,
    })

    entries.push(...results)
}

const example = entries.find(
    entry => entry.word === 'UNFÄLLEN'
)

console.dir(example, {
    depth: null,
})