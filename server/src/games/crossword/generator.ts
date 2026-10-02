import type {
    CrosswordCell,
    CrosswordClue,
    CrosswordPuzzle,
} from './types'

export type CrosswordBankEntry = {
    id: string
    word: string
    clue: string
}

type Direction = 'right' | 'down'

type GeneratorOptions = {
    rows?: number
    cols?: number
    targetWords?: number
    seed?: number
}

type PreparedEntry = {
    id: string
    word: string
    clue: string
}

type GridCell =
    | {
        type: 'letter'
        letter: string
    }
    | {
        type: 'clue'
        clues: CrosswordClue[]
    }
    | undefined

type Placement = {
    entry: PreparedEntry
    direction: Direction
    clueRow: number
    clueCol: number
    cells: {
        row: number
        col: number
    }[]
}

function createRandom(seed: number) {
    let state = seed >>> 0

    return () => {
        state =
            (state * 1664525 + 1013904223) >>> 0

        return state / 4294967296
    }
}

function shuffle<T>(
    items: T[],
    random: () => number
): T[] {
    const result = [...items]

    for (
        let i = result.length - 1;
        i > 0;
        i--
    ) {
        const j = Math.floor(
            random() * (i + 1)
        )

            ;[result[i], result[j]] = [
                result[j]!,
                result[i]!,
            ]
    }

    return result
}

type LayoutCell = 'letter' | 'clue'

function isLayoutValid(
    layout: LayoutCell[][],
    rows: number,
    cols: number
): boolean {
    const slots = findSlots(
        layout,
        rows,
        cols
    )

    const coveredLetters =
        new Set<string>()

    const usedClues =
        new Set<string>()

    for (const slot of slots) {
        usedClues.add(
            `${slot.clueRow},${slot.clueCol}`
        )

        for (const cell of slot.cells) {
            coveredLetters.add(
                `${cell.row},${cell.col}`
            )
        }
    }

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const key = `${row},${col}`

            if (
                layout[row]![col] === 'letter' &&
                !coveredLetters.has(key)
            ) {
                return false
            }

            if (
                layout[row]![col] === 'clue' &&
                !usedClues.has(key)
            ) {
                return false
            }
        }
    }

    return true
}

function generateLayout(
    rows: number,
    cols: number,
    random: () => number
): LayoutCell[][] {
    /*
     * Wir starten mit einem garantiert
     * gültigen Grundraster.
     *
     * Danach variieren wir es durch
     * Transponieren. Das erhält sämtliche
     * gültigen Wortsegmente, tauscht aber
     * horizontal und vertikal.
     *
     * Später erweitern wir diese Sammlung
     * um weitere gültige Grundformen.
     */

    const templates: string[][] = [
        [
            '##...#...#...##',
            '..#.....##.....',
            '..#.........#..',
            '...##.....#....',
            '#......#.#...#.',
            '.#....#...#....',
            '.#....#...#....',
            '..#.....##.....',
            '#.#..#.....#...',
            '.....##...#...#',
            '....#..#.......',
            '...#.....##.##.',
            '..#....#...#...',
            '.#....#........',
            '.#.....#.......',
        ],
        [
            '##...##.......#',
            '.#.....##......',
            '..#...#......#.',
            '..##.....#.....',
            '#....##........',
            '....#.....#....',
            '.#....##....#..',
            '....#......#...',
            '#..#.......#...',
            '...##.....#....',
            '.#..##...##...#',
            '..#..##....#.#.',
            '......#...#....',
            '...#...#.......',
            '#.....#...#....',
        ],
        [
            '#....#...#.....',
            '##...#.........',
            '..#...#...##...',
            '..#......#.....',
            '...#....##....#',
            '...##........#.',
            '....#.......#..',
            '.#....#........',
            '.#...#....##...',
            '#........#....#',
            '##..#...##...#.',
            '..#..#.#...#...',
            '.......#.......',
            '...#......#....',
            '.#....#...#....',
        ],
    ]

    const templateIndex =
        Math.floor(
            random() *
            templates.length
        )

    console.log(
        `Template ${templateIndex + 1}`
    )

    const source =
        templates[templateIndex]!

    let layout: LayoutCell[][] =
        source.map(row =>
            [...row].map(
                cell =>
                    cell === '#'
                        ? 'clue'
                        : 'letter'
            )
        )

    /*
     * 50 % Wahrscheinlichkeit:
     * Raster transponieren.
     *
     * Ein gültiges horizontales Wort
     * wird dadurch zu einem gültigen
     * vertikalen Wort und umgekehrt.
     */
    if (random() < 0.5) {
        layout =
            Array.from(
                { length: cols },
                (_, row) =>
                    Array.from(
                        { length: rows },
                        (_, col) =>
                            layout[col]![row]!
                    )
            )
    }

    // Hinweisfelder intelligent verschieben
    const mutationAttempts = 250
    const targetMutations = 8
    let successfulMutations = 0

    const directions: [number, number][] = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
        [-2, 0],
        [2, 0],
        [0, -2],
        [0, 2],
    ]

    for (
        let attempt = 0;
        attempt < mutationAttempts &&
        successfulMutations < targetMutations;
        attempt++
    ) {
        const clueCells: {
            row: number
            col: number
        }[] = []

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (
                    layout[row]![col] === 'clue'
                ) {
                    clueCells.push({
                        row,
                        col,
                    })
                }
            }
        }

        const source =
            clueCells[
            Math.floor(
                random() * clueCells.length
            )
            ]

        if (!source) {
            continue
        }

        const [dr, dc] =
            directions[
            Math.floor(
                random() * directions.length
            )
            ]!

        const targetRow =
            source.row + dr

        const targetCol =
            source.col + dc

        if (
            targetRow < 0 ||
            targetRow >= rows ||
            targetCol < 0 ||
            targetCol >= cols
        ) {
            continue
        }

        if (
            layout[targetRow]![targetCol] !==
            'letter'
        ) {
            continue
        }

        // Hinweisfeld verschieben
        layout[source.row]![source.col] =
            'letter'

        layout[targetRow]![targetCol] =
            'clue'

        // Keine 3 Hinweisfelder direkt hintereinander
        let hasClueWall = false

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const horizontal =
                    col + 2 < cols &&
                    layout[row]![col] === 'clue' &&
                    layout[row]![col + 1] === 'clue' &&
                    layout[row]![col + 2] === 'clue'

                const vertical =
                    row + 2 < rows &&
                    layout[row]![col] === 'clue' &&
                    layout[row + 1]![col] === 'clue' &&
                    layout[row + 2]![col] === 'clue'

                if (
                    horizontal ||
                    vertical
                ) {
                    hasClueWall = true
                    break
                }
            }

            if (hasClueWall) {
                break
            }
        }

        if (
            hasClueWall ||
            !isLayoutValid(
                layout,
                rows,
                cols
            )
        ) {
            // Ersten Move rückgängig machen
            layout[source.row]![source.col] =
                'clue'

            layout[targetRow]![targetCol] =
                'letter'

            // Falls Einzel-Move scheitert:
            // zwei Clues gleichzeitig verschieben
            const secondSource =
                clueCells[
                Math.floor(
                    random() * clueCells.length
                )
                ]

            if (
                !secondSource ||
                (
                    secondSource.row === source.row &&
                    secondSource.col === source.col
                )
            ) {
                continue
            }

            const [dr2, dc2] =
                directions[
                Math.floor(
                    random() * directions.length
                )
                ]!

            const targetRow2 =
                secondSource.row + dr2

            const targetCol2 =
                secondSource.col + dc2

            if (
                targetRow2 < 0 ||
                targetRow2 >= rows ||
                targetCol2 < 0 ||
                targetCol2 >= cols
            ) {
                continue
            }

            if (
                layout[targetRow]![targetCol] !== 'letter' ||
                layout[targetRow2]![targetCol2] !== 'letter'
            ) {
                continue
            }

            if (
                targetRow === targetRow2 &&
                targetCol === targetCol2
            ) {
                continue
            }

            // Beide Moves gleichzeitig durchführen
            layout[source.row]![source.col] =
                'letter'

            layout[secondSource.row]![secondSource.col] =
                'letter'

            layout[targetRow]![targetCol] =
                'clue'

            layout[targetRow2]![targetCol2] =
                'clue'

            let hasDoubleMoveClueWall = false

            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const horizontal =
                        col + 2 < cols &&
                        layout[row]![col] === 'clue' &&
                        layout[row]![col + 1] === 'clue' &&
                        layout[row]![col + 2] === 'clue'

                    const vertical =
                        row + 2 < rows &&
                        layout[row]![col] === 'clue' &&
                        layout[row + 1]![col] === 'clue' &&
                        layout[row + 2]![col] === 'clue'

                    if (horizontal || vertical) {
                        hasDoubleMoveClueWall = true
                        break
                    }
                }

                if (hasDoubleMoveClueWall) {
                    break
                }
            }

            if (
                hasDoubleMoveClueWall ||
                !isLayoutValid(
                    layout,
                    rows,
                    cols
                )
            ) {
                // Beide Moves rückgängig machen
                layout[source.row]![source.col] =
                    'clue'

                layout[secondSource.row]![secondSource.col] =
                    'clue'

                layout[targetRow]![targetCol] =
                    'letter'

                layout[targetRow2]![targetCol2] =
                    'letter'

                continue
            }

            successfulMutations++
            continue
        }

        successfulMutations++
    }

    console.log(
        `Mutationen: ${successfulMutations}/${targetMutations}`
    )

    console.log(
        `Slots: ${findSlots(layout, rows, cols).length}`
    )

    return layout

}

type Slot = {
    clueRow: number
    clueCol: number
    direction: Direction
    cells: {
        row: number
        col: number
    }[]
}

function findSlots(
    layout: LayoutCell[][],
    rows: number,
    cols: number
): Slot[] {
    const slots: Slot[] = []

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (layout[row]![col] !== 'clue') {
                continue
            }

            // Wort nach rechts
            if (
                col + 1 < cols &&
                layout[row]![col + 1] === 'letter'
            ) {
                const cells: Slot['cells'] = []

                for (
                    let c = col + 1;
                    c < cols &&
                    layout[row]![c] === 'letter';
                    c++
                ) {
                    cells.push({
                        row,
                        col: c,
                    })
                }

                if (
                    cells.length >= 3 &&
                    cells.length <= 9
                ) {
                    slots.push({
                        clueRow: row,
                        clueCol: col,
                        direction: 'right',
                        cells,
                    })
                }
            }

            // Wort nach unten
            if (
                row + 1 < rows &&
                layout[row + 1]![col] === 'letter'
            ) {
                const cells: Slot['cells'] = []

                for (
                    let r = row + 1;
                    r < rows &&
                    layout[r]![col] === 'letter';
                    r++
                ) {
                    cells.push({
                        row: r,
                        col,
                    })
                }

                if (
                    cells.length >= 3 &&
                    cells.length <= 9
                ) {
                    slots.push({
                        clueRow: row,
                        clueCol: col,
                        direction: 'down',
                        cells,
                    })
                }
            }
        }
    }

    return slots
}


export function generateCrossword(
    bank: CrosswordBankEntry[],
    options: GeneratorOptions = {}
): CrosswordPuzzle {
    const seed =
        options.seed ??
        Math.floor(Math.random() * 1_000_000)
    const random = createRandom(seed)
    console.log(`Crossword seed: ${seed}`)

    const rows = options.rows ?? 15
    const cols = options.cols ?? 15
    const targetWords =
        options.targetWords ?? 25

    const usable: PreparedEntry[] =
        shuffle(
            bank
                .map((entry) => ({
                    id: entry.id,
                    word: entry.word
                        .trim()
                        .toUpperCase(),
                    clue: entry.clue.trim(),
                }))
                .filter(
                    (entry) =>
                        entry.word.length >= 3 &&
                        entry.word.length <= 9 &&
                        /^[A-ZÄÖÜ]+$/.test(
                            entry.word
                        ) &&
                        entry.clue.length >= 4
                ),
            random
        )

    if (usable.length === 0) {
        throw new Error(
            'Keine geeigneten Wörter gefunden.'
        )
    }

    const wordsByLength = new Map<
        number,
        PreparedEntry[]
    >()

    for (const entry of usable) {
        const list =
            wordsByLength.get(entry.word.length) ?? []

        list.push(entry)
        wordsByLength.set(entry.word.length, list)
    }

    let layout!: LayoutCell[][]
    let slots!: Slot[]
    let letters!: (string | undefined)[][]
    let assignments!: Map<Slot, PreparedEntry>

    let solved = false

    for (
        let layoutAttempt = 0;
        layoutAttempt < 30 && !solved;
        layoutAttempt++
    ) {
        console.log(
            `Versuche Layout ${layoutAttempt + 1}/30...`
        )

        const cells: CrosswordCell[] = []

        const currentLayout =
            generateLayout(
                rows,
                cols,
                random
            )

        const currentSlots =
            findSlots(
                currentLayout,
                rows,
                cols
            )

        const coveredCells = new Set<string>()

        for (const slot of currentSlots) {
            for (const cell of slot.cells) {
                coveredCells.add(
                    `${cell.row},${cell.col}`
                )
            }
        }

        let layoutValid = true

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (
                    currentLayout[row]![col] === 'letter' &&
                    !coveredCells.has(`${row},${col}`)
                ) {
                    console.log(
                        `Unbenutzt: row=${row}, col=${col}`
                    )

                    layoutValid = false
                    break
                }
            }

            if (!layoutValid) {
                break
            }
        }

        if (!layoutValid) {
            console.log(
                `Layout ${layoutAttempt + 1} verworfen (unbenutzte Felder)`
            )
            continue
        }

        const currentLetters:
            (string | undefined)[][] =
            Array.from(
                { length: rows },
                () =>
                    Array<string | undefined>(
                        cols
                    ).fill(undefined)
            )

        const currentAssignments =
            new Map<Slot, PreparedEntry>()

        const usedWords =
            new Set<string>()

        function candidatesFor(
            slot: Slot
        ): PreparedEntry[] {
            const candidates =
                wordsByLength.get(
                    slot.cells.length
                ) ?? []

            return candidates.filter(entry => {
                if (
                    usedWords.has(entry.word)
                ) {
                    return false
                }

                return slot.cells.every(
                    (cell, index) => {
                        const existing =
                            currentLetters[
                            cell.row
                            ]?.[cell.col]

                        return (
                            existing ===
                            undefined ||
                            existing ===
                            entry.word[index]
                        )
                    }
                )
            })
        }

        let solveSteps = 0
        const MAX_SOLVE_STEPS = 20000

        function solve(): boolean {
            solveSteps++

            if (
                solveSteps >
                MAX_SOLVE_STEPS
            ) {
                return false
            }

            if (
                currentAssignments.size ===
                currentSlots.length
            ) {
                return true
            }

            let bestSlot:
                Slot | undefined

            let bestCandidates:
                PreparedEntry[] = []

            for (
                const slot of currentSlots
            ) {
                if (
                    currentAssignments.has(
                        slot
                    )
                ) {
                    continue
                }

                const candidates =
                    candidatesFor(slot)

                if (
                    candidates.length === 0
                ) {
                    return false
                }

                if (
                    !bestSlot ||
                    candidates.length <
                    bestCandidates.length
                ) {
                    bestSlot = slot
                    bestCandidates =
                        candidates
                }
            }

            if (!bestSlot) {
                return true
            }

            bestCandidates = bestCandidates
                .map(entry => {
                    const oldLetters =
                        bestSlot!.cells.map(
                            cell =>
                                currentLetters[
                                cell.row
                                ]?.[cell.col]
                        )

                    bestSlot!.cells.forEach(
                        (cell, index) => {
                            currentLetters[
                                cell.row
                            ]![cell.col] =
                                entry.word[index]
                        }
                    )

                    usedWords.add(entry.word)

                    let score = 0
                    let impossible = false

                    for (const slot of currentSlots) {
                        if (
                            slot === bestSlot ||
                            currentAssignments.has(slot)
                        ) {
                            continue
                        }

                        const count =
                            candidatesFor(slot).length

                        if (count === 0) {
                            impossible = true
                            break
                        }

                        score += count
                    }

                    usedWords.delete(entry.word)

                    bestSlot!.cells.forEach(
                        (cell, index) => {
                            currentLetters[
                                cell.row
                            ]![cell.col] =
                                oldLetters[index]
                        }
                    )

                    return {
                        entry,
                        score:
                            impossible
                                ? -1
                                : score,
                        tieBreaker: random(),
                    }
                })
                .filter(item => item.score >= 0)
                .sort(
                    (a, b) =>
                        b.score - a.score ||
                        a.tieBreaker - b.tieBreaker
                )
                .map(item => item.entry)

            for (
                const entry of
                bestCandidates
            ) {
                const oldLetters =
                    bestSlot.cells.map(
                        cell =>
                            currentLetters[
                            cell.row
                            ]?.[cell.col]
                    )

                bestSlot.cells.forEach(
                    (cell, index) => {
                        currentLetters[
                            cell.row
                        ]![cell.col] =
                            entry.word[index]
                    }
                )

                currentAssignments.set(
                    bestSlot,
                    entry
                )

                usedWords.add(
                    entry.word
                )

                if (solve()) {
                    return true
                }

                currentAssignments.delete(
                    bestSlot
                )

                usedWords.delete(
                    entry.word
                )

                bestSlot.cells.forEach(
                    (cell, index) => {
                        currentLetters[
                            cell.row
                        ]![cell.col] =
                            oldLetters[index]
                    }
                )
            }

            return false
        }

        if (solve()) {
            console.log(
                `Layout ${layoutAttempt + 1} gelöst nach ${solveSteps} Schritten`
            )

            layout = currentLayout
            slots = currentSlots
            letters = currentLetters
            assignments =
                currentAssignments

            solved = true
        } else {
            console.log(
                `Layout ${layoutAttempt + 1} verworfen (${solveSteps} Schritte)`
            )
        }
    }

    if (!solved) {
        throw new Error(
            'Nach 30 Layouts keine lösbare Variante gefunden.'
        )
    }

    console.log(
        layout
            .map(row =>
                row
                    .map(cell =>
                        cell === 'clue'
                            ? '■'
                            : '□'
                    )
                    .join('')
            )
            .join('\n')
    )

    const cells: CrosswordCell[] = []

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (
                layout[row]![col] ===
                'letter'
            ) {
                const solution =
                    letters[row]?.[col]

                if (!solution) {
                    throw new Error(
                        `Ungefüllte Zelle ${row},${col}`
                    )
                }

                cells.push({
                    type: 'letter',
                    row,
                    col,
                    solution,
                })

                continue
            }

            const clueSlots =
                slots.filter(
                    slot =>
                        slot.clueRow === row &&
                        slot.clueCol === col
                )

            const clues: CrosswordClue[] =
                clueSlots.map(slot => {
                    const entry =
                        assignments.get(slot)!

                    return {
                        clue: entry.clue,
                        answer: entry.word,
                        direction:
                            slot.direction,
                    }
                })

            cells.push({
                type: 'clue',
                row,
                col,
                clues,
            })
        }
    }

    return {
        id: `generated-${seed}`,
        title: `Schwedenrätsel ${seed}`,
        rows,
        cols,
        cells,
    }
}