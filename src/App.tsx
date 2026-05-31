import { useEffect, useState } from 'react'
import './App.css'
import { socket } from './socket.ts'

type Screen = 'home' | 'create' | 'game'
type Phase =
  | 'memorize'
  | 'turn'
  | 'drawn'
  | 'swap'
  | 'declare-set'
  | 'action-choice'
  | 'peek-own'
  | 'peek-opponent'
  | 'special-swap'
  | 'round-over'
  | 'game-over'

type Player = {
  name: string
  cards: number[]
  seenStartCards: number[]
  totalScore: number
}

type OnlineLobby = {
  code: string
  hostId: string
  players: {
    id: string
    name: string
    cards: number[]
    ready: boolean
  }[]
  drawPile: number[]
  discardPile: number[]
  currentPlayer: number
  phase: 'lobby' | 'memorize' | 'turn'
}

type CardPosition = {
  player: number
  card: number
}

function createDeck() {
  const deck = [
    0, 0,
    1, 1, 1, 1,
    2, 2, 2, 2,
    3, 3, 3, 3,
    4, 4, 4, 4,
    5, 5, 5, 5,
    6, 6, 6, 6,
    7, 7, 7, 7,
    8, 8, 8, 8,
    9, 9, 9, 9,
    10, 10, 10, 10,
    11, 11, 11, 11,
    12, 12, 12, 12,
    13, 13,
  ]

  return deck.sort(() => Math.random() - 0.5)
}

function cardAction(card: number): Phase | null {
  if (card === 7 || card === 8) return 'peek-own'
  if (card === 9 || card === 10) return 'peek-opponent'
  if (card === 11 || card === 12) return 'special-swap'
  return null
}

function handScore(cards: number[]) {
  return cards.reduce((sum, card) => sum + card, 0)
}

function isKamikaze(cards: number[]) {
  const twelves = cards.filter((card) => card === 12).length
  const thirteens = cards.filter((card) => card === 13).length
  return twelves === 2 && thirteens === 2
}

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [playerNames, setPlayerNames] = useState(['Max', 'Gast 2'])
  const [onlineLobby, setOnlineLobby] = useState<OnlineLobby | null>(null)
  const [onlineName, setOnlineName] = useState('Max')
  const [onlineCode, setOnlineCode] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPlayer, setCurrentPlayer] = useState(0)
  const [phase, setPhase] = useState<Phase>('memorize')
  const [drawPile, setDrawPile] = useState<number[]>([])
  const [discardPile, setDiscardPile] = useState<number[]>([])
  const [discardLocked, setDiscardLocked] = useState(false)
  const [drawnCard, setDrawnCard] = useState<number | null>(null)
  const [drawSource, setDrawSource] = useState<'deck' | 'discard' | null>(null)
  const [revealed, setRevealed] = useState<CardPosition[]>([])
  const [pendingAction, setPendingAction] = useState<Phase | null>(null)
  const [selectedSwapCard, setSelectedSwapCard] = useState<CardPosition | null>(null)
  const [selectedSetCards, setSelectedSetCards] = useState<number[]>([])
  const [setMessage, setSetMessage] = useState('')
  const [caboCalledBy, setCaboCalledBy] = useState<number | null>(null)
  const [turnsAfterCabo, setTurnsAfterCabo] = useState(0)
  const [roundScores, setRoundScores] = useState<number[]>([])
  const [caboPenaltyApplied, setCaboPenaltyApplied] = useState(false)
  const [kamikazePlayer, setKamikazePlayer] = useState<number | null>(null)
  const [myPlayerId, setMyPlayerId] = useState('')
  const [revealedStartCards, setRevealedStartCards] = useState<number[]>([])
  const [myDrawnCard, setMyDrawnCard] = useState<number | null>(null)
  
  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server:', socket.id)
      setMyPlayerId(socket.id!)
    })

    socket.on('lobby-created', (lobby: OnlineLobby) => {
      setOnlineLobby(lobby)
    })

    socket.on('lobby-updated', (lobby: OnlineLobby) => {
      setOnlineLobby(lobby)
    })

    socket.on('game-started', (lobby: OnlineLobby) => {
      setOnlineLobby(lobby)
    })

    socket.on('draw-card-result', (card: number) => {
      setMyDrawnCard(card)
    })

    socket.on('lobby-error', (message: string) => {
      alert(message)
    })

    return () => {
      socket.off('connect')
      socket.off('lobby-created')
      socket.off('lobby-updated')
      socket.off('lobby-error')
      socket.off('game-started')
      socket.off('draw-card-result')
    }
  }, [])

  const activePlayer = players[currentPlayer]

  function createRound(newPlayers: Player[]) {
    const deck = createDeck()

    const dealtPlayers = newPlayers.map((player, index) => ({
      ...player,
      cards: deck.slice(index * 4, index * 4 + 4),
      seenStartCards: [],
    }))

    const usedCards = dealtPlayers.length * 4
    const firstDiscard = deck[usedCards]
    const remainingDeck = deck.slice(usedCards + 1)

    setPlayers(dealtPlayers)
    setDrawPile(remainingDeck)
    setDiscardPile([firstDiscard])
    setDiscardLocked(false)
    setCurrentPlayer(0)
    setPhase('memorize')
    setDrawnCard(null)
    setDrawSource(null)
    setRevealed([])
    setPendingAction(null)
    setSelectedSwapCard(null)
    setSelectedSetCards([])
    setSetMessage('')
    setCaboCalledBy(null)
    setTurnsAfterCabo(0)
    setRoundScores([])
    setCaboPenaltyApplied(false)
    setKamikazePlayer(null)
    setScreen('game')
  }

  function startGame() {
    const newPlayers: Player[] = playerNames
      .filter((name) => name.trim())
      .map((name) => ({
        name: name.trim(),
        cards: [],
        seenStartCards: [],
        totalScore: 0,
      }))

    createRound(newPlayers)
  }

  function startNextRound() {
    createRound(players)
  }

  function calculateAndSaveRound() {
    const kamikazePlayerIndex = players.findIndex((player) =>
      isKamikaze(player.cards)
    )

    let finalRoundScores: number[] = []

    if (kamikazePlayerIndex !== -1) {

      setKamikazePlayer(kamikazePlayerIndex)

      finalRoundScores = players.map((_, index) =>
        index === kamikazePlayerIndex ? 0 : 50
      )
      setCaboPenaltyApplied(false)
    } else {
      const rawScores = players.map((player) => handScore(player.cards))
      const lowestScore = Math.min(...rawScores)

      finalRoundScores = rawScores.map((score, index) => {
        const hasLowestScore = score === lowestScore

        if (caboCalledBy !== null) {
          const caboCallerHasLowestScore = rawScores[caboCalledBy] === lowestScore

          if (index === caboCalledBy && caboCallerHasLowestScore) return 0
          if (index === caboCalledBy && !caboCallerHasLowestScore) return score + 5
          if (!caboCallerHasLowestScore && hasLowestScore) return 0

          return score
        }

        return hasLowestScore ? 0 : score
      })

      setCaboPenaltyApplied(
        caboCalledBy !== null && rawScores[caboCalledBy] > lowestScore
      )
    }

    const updatedPlayers = players.map((player, index) => {
      let newTotal = player.totalScore + finalRoundScores[index]
      if (newTotal === 100) newTotal = 50

      return {
        ...player,
        totalScore: newTotal,
      }
    })

    setRoundScores(finalRoundScores)
    setPlayers(updatedPlayers)

    if (updatedPlayers.some((player) => player.totalScore >= 101)) {
      setPhase('game-over')
    } else {
      setPhase('round-over')
    }
  }

  function endTurn() {
    setDrawnCard(null)
    setDrawSource(null)
    setPendingAction(null)
    setSelectedSwapCard(null)
    setSelectedSetCards([])
    setSetMessage('')
    setRevealed([])

    if (caboCalledBy !== null) {
      const nextTurns = turnsAfterCabo + 1
      setTurnsAfterCabo(nextTurns)

      if (nextTurns >= players.length - 1) {
        calculateAndSaveRound()
        return
      }
    }

    setCurrentPlayer((currentPlayer + 1) % players.length)
    setPhase('turn')
  }

  function revealStartCard(cardIndex: number) {
    if (phase !== 'memorize') return

    const player = players[currentPlayer]
    if (player.seenStartCards.includes(cardIndex)) return
    if (player.seenStartCards.length >= 2) return

    setRevealed([...revealed, { player: currentPlayer, card: cardIndex }])

    const updatedPlayers = [...players]
    updatedPlayers[currentPlayer] = {
      ...player,
      seenStartCards: [...player.seenStartCards, cardIndex],
    }

    setPlayers(updatedPlayers)

    if (updatedPlayers[currentPlayer].seenStartCards.length === 2) {
      setTimeout(() => {
        setRevealed([])

        if (currentPlayer === players.length - 1) {
          setCurrentPlayer(0)
          setPhase('turn')
        } else {
          setCurrentPlayer(currentPlayer + 1)
        }
      }, 3000)
    }
  }

  function drawFromDeck() {
    if (phase !== 'turn') return
    if (drawnCard !== null) return

    if (drawPile.length > 0) {
      setDrawnCard(drawPile[0])
      setDrawPile(drawPile.slice(1))
      setDrawSource('deck')
      setPhase('drawn')
      return
    }

    if (discardPile.length <= 1) return

    const topDiscard = discardPile[discardPile.length - 1]
    const cardsToShuffle = discardPile.slice(0, -1)
    const newDrawPile = cardsToShuffle.sort(() => Math.random() - 0.5)

    setDiscardPile([topDiscard])
    setDiscardLocked(false)
    setDrawnCard(newDrawPile[0])
    setDrawPile(newDrawPile.slice(1))
    setDrawSource('deck')
    setPhase('drawn')
  }

  function takeFromDiscard() {
    if (phase !== 'turn') return
    if (discardLocked) return
    if (discardPile.length === 0) return

    const topCard = discardPile[discardPile.length - 1]
    setDrawnCard(topCard)
    setDiscardPile(discardPile.slice(0, -1))
    setDrawSource('discard')
    setPhase('swap')
  }

  function discardDrawnCard() {
    if (drawnCard === null) return
    if (drawSource !== 'deck') return

    const discarded = drawnCard
    setDiscardPile([...discardPile, discarded])
    setDiscardLocked(false)
    setDrawnCard(null)
    setDrawSource(null)

    const action = cardAction(discarded)

    if (action) {
      setPendingAction(action)
      setPhase('action-choice')
    } else {
      endTurn()
    }
  }

  function swapDrawnWithHand(cardIndex: number) {
    if (drawnCard === null) return
    if (phase !== 'swap' && phase !== 'drawn') return

    const updatedPlayers = [...players]
    const oldCard = updatedPlayers[currentPlayer].cards[cardIndex]

    updatedPlayers[currentPlayer].cards[cardIndex] = drawnCard

    setPlayers(updatedPlayers)
    setDiscardPile([...discardPile, oldCard])
    setDiscardLocked(false)
    setDrawnCard(null)
    setDrawSource(null)
    endTurn()
  }

  function startDeclareSet() {
    if (drawnCard === null) return
    if (phase !== 'drawn' && phase !== 'swap') return

    setSelectedSetCards([])
    setSetMessage('')
    setPhase('declare-set')
  }

  function toggleSetCard(cardIndex: number) {
    if (phase !== 'declare-set') return

    if (selectedSetCards.includes(cardIndex)) {
      setSelectedSetCards(selectedSetCards.filter((index) => index !== cardIndex))
      return
    }

    if (selectedSetCards.length >= 4) return

    setSelectedSetCards([...selectedSetCards, cardIndex])
  }

  function confirmSetDeclaration() {
    if (drawnCard === null) return
    if (phase !== 'declare-set') return
    if (selectedSetCards.length < 2) {
      setSetMessage('Wähle mindestens 2 Karten aus.')
      return
    }

    const activeCards = players[currentPlayer].cards
    const selectedValues = selectedSetCards.map((index) => activeCards[index])
    const allSame = selectedValues.every((value) => value === selectedValues[0])

    if (!allSame) {
      setSetMessage('Kein gültiger Satz. Zug beendet.')
      setDiscardPile([...discardPile, drawnCard])
      setDiscardLocked(false)
      setDrawnCard(null)
      setDrawSource(null)

      setTimeout(() => {
        endTurn()
      }, 1200)

      return
    }

    const sortedSelected = [...selectedSetCards].sort((a, b) => a - b)
    const removedCards = sortedSelected.map((index) => activeCards[index])

    const remainingCards = activeCards.filter(
      (_, index) => !sortedSelected.includes(index)
    )

    const insertAt = sortedSelected[0]
    const newHand = [
      ...remainingCards.slice(0, insertAt),
      drawnCard,
      ...remainingCards.slice(insertAt),
    ]

    const updatedPlayers = [...players]
    updatedPlayers[currentPlayer] = {
      ...updatedPlayers[currentPlayer],
      cards: newHand,
    }

    setPlayers(updatedPlayers)
    setDiscardPile([...discardPile, ...removedCards])
    setDiscardLocked(true)
    setDrawnCard(null)
    setDrawSource(null)
    setSelectedSetCards([])
    setSetMessage('Satz korrekt. Karten wurden abgelegt.')

    setTimeout(() => {
      endTurn()
    }, 1200)
  }

  function cancelSetDeclaration() {
    if (drawSource === 'discard') {
      setPhase('swap')
    } else {
      setPhase('drawn')
    }

    setSelectedSetCards([])
    setSetMessage('')
  }

  function usePendingAction() {
    if (!pendingAction) return
    setPhase(pendingAction)
  }

  function skipPendingAction() {
    endTurn()
  }

  function peekOwn(cardIndex: number) {
    if (phase !== 'peek-own') return

    setRevealed([{ player: currentPlayer, card: cardIndex }])

    setTimeout(() => {
      setRevealed([])
      endTurn()
    }, 3000)
  }

  function peekOpponent(playerIndex: number, cardIndex: number) {
    if (phase !== 'peek-opponent') return
    if (playerIndex === currentPlayer) return

    setRevealed([{ player: playerIndex, card: cardIndex }])

    setTimeout(() => {
      setRevealed([])
      endTurn()
    }, 3000)
  }

  function specialSwap(playerIndex: number, cardIndex: number) {
    if (phase !== 'special-swap') return

    if (!selectedSwapCard) {
      setSelectedSwapCard({ player: playerIndex, card: cardIndex })
      return
    }

    const a = selectedSwapCard
    const b = { player: playerIndex, card: cardIndex }

    const firstIsOwn = a.player === currentPlayer
    const secondIsOwn = b.player === currentPlayer

    if (firstIsOwn === secondIsOwn) return
    if (a.player === b.player && a.card === b.card) return

    const updatedPlayers = [...players]
    const temp = updatedPlayers[a.player].cards[a.card]

    updatedPlayers[a.player].cards[a.card] = updatedPlayers[b.player].cards[b.card]
    updatedPlayers[b.player].cards[b.card] = temp

    setPlayers(updatedPlayers)
    setSelectedSwapCard(null)
    endTurn()
  }

  function handleCardClick(playerIndex: number, cardIndex: number) {
    if (phase === 'memorize' && playerIndex === currentPlayer) {
      revealStartCard(cardIndex)
      return
    }

    if (phase === 'declare-set' && playerIndex === currentPlayer) {
      toggleSetCard(cardIndex)
      return
    }

    if ((phase === 'swap' || phase === 'drawn') && playerIndex === currentPlayer) {
      swapDrawnWithHand(cardIndex)
      return
    }

    if (phase === 'peek-own' && playerIndex === currentPlayer) {
      peekOwn(cardIndex)
      return
    }

    if (phase === 'peek-opponent') {
      peekOpponent(playerIndex, cardIndex)
      return
    }

    if (phase === 'special-swap') {
      specialSwap(playerIndex, cardIndex)
      return
    }
  }

  function callCabo() {
    if (phase !== 'turn') return
    if (caboCalledBy !== null) return

    setCaboCalledBy(currentPlayer)
    endTurn()
  }

  function getMessage() {
    if (phase === 'memorize') return `${activePlayer?.name}: Wähle 2 Karten zum Merken.`
    if (phase === 'turn') return `${activePlayer?.name} ist am Zug.`
    if (phase === 'drawn') return 'Gezogene Karte: abwerfen, tauschen oder Satz ansagen.'
    if (phase === 'swap') return 'Wähle eine eigene Karte zum Tauschen.'
    if (phase === 'declare-set') return 'Wähle 2–4 eigene Karten, die angeblich gleich sind.'
    if (phase === 'action-choice') return 'Du darfst die Sonderaktion nutzen oder überspringen.'
    if (phase === 'peek-own') return 'Wähle eine eigene Karte zum kurzen Anschauen.'
    if (phase === 'peek-opponent') return 'Wähle eine gegnerische Karte zum kurzen Anschauen.'
    if (phase === 'special-swap') return selectedSwapCard ? 'Wähle die zweite Karte zum Tauschen.' : 'Wähle die erste Karte zum Tauschen.'
    if (phase === 'round-over') return 'Runde beendet.'
    if (phase === 'game-over') return 'Spiel beendet.'
  }

  function isRevealed(playerIndex: number, cardIndex: number) {
    return revealed.some((item) => item.player === playerIndex && item.card === cardIndex)
  }

  function winnerText() {
    const sortedPlayers = [...players].sort((a, b) => a.totalScore - b.totalScore)
    return `${sortedPlayers[0].name} gewinnt mit ${sortedPlayers[0].totalScore} Punkten!`
  }

  function cardClass(playerIndex: number, cardIndex: number, small = false) {
    const classes = ['gameCard']

    if (small) classes.push('small')

    if (
      selectedSwapCard?.player === playerIndex &&
      selectedSwapCard.card === cardIndex
    ) {
      classes.push('selected')
    }

    if (
      phase === 'declare-set' &&
      playerIndex === currentPlayer &&
      selectedSetCards.includes(cardIndex)
    ) {
      classes.push('selected')
    }

    return classes.join(' ')
  }

  if (screen === 'create') {
    return (
      <main className="page">
        <section className="card">
          <button className="backButton" onClick={() => setScreen('home')}>← Zurück</button>
          <h1>Spiel erstellen</h1>
          <p>Lokale Testversion. Multiplayer kommt später.</p>

          {playerNames.map((name, index) => (
            <input
              key={index}
              placeholder={`Spieler ${index + 1}`}
              value={name}
              onChange={(e) => {
                const names = [...playerNames]
                names[index] = e.target.value
                setPlayerNames(names)
              }}
            />
          ))}

          {playerNames.length < 4 && (
            <button className="secondaryButton" onClick={() => setPlayerNames([...playerNames, `Gast ${playerNames.length + 1}`])}>
              Spieler hinzufügen
            </button>
          )}

          {playerNames.length > 2 && (
            <button className="secondaryButton" onClick={() => setPlayerNames(playerNames.slice(0, -1))}>
              Spieler entfernen
            </button>
          )}

          <button className="primaryButton" onClick={startGame}>
            Spiel starten
          </button>
        </section>
      </main>
    )
  }

  if (screen === 'game') {
    return (
      <main className="page">
        <section className="tableCard">
          <p className="eyebrow">CABO</p>
          <h1>{getMessage()}</h1>

          {caboCalledBy !== null && phase !== 'round-over' && phase !== 'game-over' && (
            <p className="caboBanner">CABO wurde von {players[caboCalledBy].name} angesagt!</p>
          )}

          <button
            className="secondaryButton"
            onClick={() => {
              const updatedPlayers = [...players]

              updatedPlayers[currentPlayer].cards = [12, 12, 13, 13]

              setPlayers(updatedPlayers)
            }}
          >
            💀 Kamikaze testen
          </button>

          <button
            className="secondaryButton"
            onClick={() => {
              calculateAndSaveRound()
            }}
          >
            🏁 Runde beenden
          </button>

          <div className="scoreBoard">
            <h2>Gesamtpunkte</h2>
            {players.map((player) => (
              <p key={player.name}>
                {player.name}: {player.totalScore}
              </p>
            ))}
          </div>

          <div className="table">
            <div className="opponents">
              {players.map((player, playerIndex) => (
                playerIndex !== currentPlayer && (
                  <div className="playerBox" key={playerIndex}>
                    <p>{player.name}</p>
                    <div className="miniCardRow">
                      {player.cards.map((card, cardIndex) => (
                        <button
                          key={cardIndex}
                          className={cardClass(playerIndex, cardIndex, true)}
                          onClick={() => handleCardClick(playerIndex, cardIndex)}
                        >
                          {isRevealed(playerIndex, cardIndex) ? card : '?'}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              ))}
            </div>

            <div className="pileRow">
              <button className="pile" onClick={drawFromDeck}>
                <p>Nachziehstapel</p>
                <strong>🂠</strong>
              </button>

              <button className="pile" onClick={takeFromDiscard}>
                <p>Ablagestapel</p>
                <strong>{discardLocked ? '🔒' : discardPile[discardPile.length - 1]}</strong>
              </button>
            </div>

            {drawnCard !== null && (
              <div className="drawnCardArea">
                <p>Gezogene Karte</p>
                <div className="gameCard">{drawnCard}</div>

                {drawSource === 'deck' && phase === 'drawn' && (
                  <button className="secondaryButton" onClick={discardDrawnCard}>
                    Abwerfen
                  </button>
                )}

                {phase === 'drawn' && (
                  <button className="primaryButton" onClick={() => setPhase('swap')}>
                    Mit Handkarte tauschen
                  </button>
                )}

                {(phase === 'drawn' || phase === 'swap') && (
                  <button className="secondaryButton" onClick={startDeclareSet}>
                    Satz gleicher Karten ansagen
                  </button>
                )}
              </div>
            )}

            {phase === 'declare-set' && (
              <div className="drawnCardArea">
                <p>Ausgewählt: {selectedSetCards.length}/4</p>
                {setMessage && <p className="caboBanner">{setMessage}</p>}

                <button className="primaryButton" onClick={confirmSetDeclaration}>
                  Satz bestätigen
                </button>

                <button className="secondaryButton" onClick={cancelSetDeclaration}>
                  Abbrechen
                </button>
              </div>
            )}

            {phase === 'action-choice' && (
              <div className="drawnCardArea">
                <button className="primaryButton" onClick={usePendingAction}>
                  Aktion nutzen
                </button>
                <button className="secondaryButton" onClick={skipPendingAction}>
                  Aktion überspringen
                </button>
              </div>
            )}

            {activePlayer && (
              <div className="playerBox active">
                <p>{activePlayer.name}</p>
                <div className="cardRow">
                  {activePlayer.cards.map((card, cardIndex) => (
                    <button
                      key={cardIndex}
                      className={cardClass(currentPlayer, cardIndex)}
                      onClick={() => handleCardClick(currentPlayer, cardIndex)}
                    >
                      {isRevealed(currentPlayer, cardIndex) ? card : '?'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {phase === 'turn' && (
            <button className="dangerButton" onClick={callCabo}>
              CABO ansagen
            </button>
          )}

          {(phase === 'round-over' || phase === 'game-over') && (
            <div className="scoreBoard">
              <h2>🏆 Rundenergebnis</h2>

              {kamikazePlayer !== null && (
                <p className="caboBanner">
                  💀 Kamikaze! {players[kamikazePlayer].name} hatte zwei 12er und zwei 13er.
                  Alle anderen erhalten 50 Punkte.
                </p>
              )}

              {players.map((player, index) => (
                <p key={player.name}>
                  {player.name}: +{roundScores[index]}
                </p>
              ))}

              {kamikazePlayer !== null ? (
                <p className="caboBanner">
                  💀 {players[kamikazePlayer].name} hat die Runde durch Kamikaze gewonnen und erhält deshalb 0 Punkte.
                </p>
              ) : (
                caboCalledBy !== null && (
                  <p className="caboBanner">
                    {caboPenaltyApplied
                      ? `${players[caboCalledBy].name} hatte nicht die niedrigste Punktzahl und erhält deshalb 5 Strafpunkte.`
                      : `${players[caboCalledBy].name} hatte die niedrigste Punktzahl und erhält deshalb 0 Punkte.`}
                  </p>
                )
              )}

              <hr />

              <h2>📊 Gesamtstand</h2>

              {players.map((player) => (
                <p key={player.name}>
                  {player.name}: {player.totalScore}
                </p>
              ))}

              {phase === 'round-over' && (
                <button className="primaryButton" onClick={startNextRound}>
                  Nächste Runde
                </button>
              )}

              {phase === 'game-over' && (
                <>
                  <div className="winnerBox">
                    <p className="eyebrow">🏆 Spielsieger</p>
                    <h1>{winnerText()}</h1>
                    <p>Starke Runde. Das Spiel ist beendet.</p>
                  </div>

                  <button className="primaryButton" onClick={() => setScreen('create')}>
                    Neues Spiel
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      </main>
    )
  }

  if (onlineLobby && onlineLobby.phase !== 'lobby') {
    const currentSocketId = socket.id
    const me = onlineLobby.players.find((player) => player.id === currentSocketId)
    const opponents = onlineLobby.players.filter((player) => player.id !== currentSocketId)
    const isMyTurn =
      onlineLobby.players[onlineLobby.currentPlayer]?.id === currentSocketId

    return (
      <main className="page">
        <section className="tableCard">
          <p className="eyebrow">Online-Spiel</p>
          <h1>{me?.name} ist im Spiel</h1>

          <p className="caboBanner">
            {onlineLobby.phase === 'memorize'
              ? '🧠 Startphase'
              : isMyTurn
                ? '🟢 Du bist am Zug'
                : '⏳ Warte auf deinen Zug'}
          </p>

          <div className="scoreBoard">
            <h2>Startphase</h2>

            {onlineLobby.players.map((player) => (
              <p key={player.id}>
                {player.name} {player.ready ? '✅' : '⏳'}
              </p>
            ))}

            <button
              className="primaryButton"
              onClick={() => {
                socket.emit('draw-from-deck', onlineLobby.code)
              }}
            >
              🂠 Karte ziehen
            </button>

            <button
              className="secondaryButton"
              onClick={() => {
                socket.emit('end-turn', onlineLobby.code)
              }}
            >
              🔄 Zug beenden
            </button>

            {myDrawnCard !== null && (
              <div className="drawnCardArea">
                <p>Gezogene Karte</p>
                <div className="gameCard">
                  {myDrawnCard}
                </div>
              </div>
            )}

            <p>
              Phase: {onlineLobby.phase}
            </p>
          </div>

          <div className="table">
            <div className="opponents">
              {opponents.map((player) => (
                <div className="playerBox" key={player.id}>
                  <p>{player.name}</p>

                  <div className="miniCardRow">
                    {player.cards.map((_, index) => (
                      <button className="gameCard small" key={index}>
                        ?
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="pileRow">
              <div className="pile">
                <p>Nachziehstapel</p>
                <strong>🂠</strong>
              </div>

              <div className="pile">
                <p>Ablagestapel</p>
                <strong>{onlineLobby.discardPile[onlineLobby.discardPile.length - 1]}</strong>
              </div>
            </div>

            <div className="playerBox active">
              <p>Deine Karten</p>

              <div className="cardRow">
                {me?.cards.map((card, index) => (
                  <button
                    className="gameCard"
                    key={index}
                    onClick={() => {
                      if (onlineLobby.phase !== 'memorize') return

                      if (revealedStartCards.includes(index)) return

                      if (revealedStartCards.length >= 2) return

                      const newCards = [...revealedStartCards, index]

                      setRevealedStartCards(newCards)

                      if (newCards.length === 2) {
                        setTimeout(() => {
                          setRevealedStartCards([])

                          if (onlineLobby) {
                            socket.emit('start-cards-done', onlineLobby.code)
                          }
                        }, 5000)
                      }
                    }}
                  >
                    {revealedStartCards.includes(index) ? card : '?'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <section className="card hero">
        <p className="eyebrow">Digitales Kartenspiel</p>
        <h1>CABO 🎮</h1>
        <p className="subtitle">Lokale Version mit Satz-Mechanik.</p>

        <button className="primaryButton" onClick={() => setScreen('create')}>
          Spiel erstellen
        </button>

        <button
          className="secondaryButton"
          onClick={() => {
            socket.emit('create-lobby', 'Max')
          }}
        >
          Online-Lobby erstellen
        </button>

        <div className="scoreBoard">
          <h2>Lobby beitreten</h2>

          <input
            placeholder="Name"
            value={onlineName}
            onChange={(e) => setOnlineName(e.target.value)}
          />

          <input
            placeholder="Lobby-Code"
            value={onlineCode}
            onChange={(e) => setOnlineCode(e.target.value.toUpperCase())}
          />

          <button
            className="secondaryButton"
            onClick={() => {
              socket.emit('join-lobby', {
                code: onlineCode,
                playerName: onlineName,
              })
            }}
          >
            Lobby beitreten
          </button>
        </div>

        {onlineLobby && (
          <div className="scoreBoard">
            <h2>Online-Lobby</h2>
            <p>Code: {onlineLobby.code}</p>

            {onlineLobby.players.map((player) => (
              <p key={player.id}>🃏 {player.name}</p>
            ))}

            <button
              className="primaryButton"
              onClick={() => {
                socket.emit('start-game', onlineLobby.code)
              }}
            >
              Online-Spiel starten
            </button>
          </div>
        )}

      </section>
    </main>

  )
}

export default App