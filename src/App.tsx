import { useEffect, useState } from 'react'
import './App.css'
import { socket } from './socket.ts'

type OnlineLobby = {
  highlightedCards: {
    playerId: string
    cardIndex: number
    type: 'memorize' | 'peek-own' | 'peek-opponent' | 'swap'
  }[]
  code: string
  hostId: string
  players: {
    id: string
    name: string
    cards: number[]
    ready: boolean
    drawnCard: number | null
    totalScore: number
  }[]
  drawPile: number[]
  discardPile: number[]
  currentPlayer: number
  caboCalledBy: string | null
  turnsAfterCabo: number
  roundScores: number[]
  caboPenaltyApplied: boolean
  kamikazePlayerId: string | null
  phase:
  | 'lobby'
  | 'memorize'
  | 'turn'
  | 'action-choice'
  | 'peek-own'
  | 'peek-opponent'
  | 'special-swap'
  | 'round-over'
  | 'game-over'
}

function App() {
  const [onlineLobby, setOnlineLobby] = useState<OnlineLobby | null>(null)
  const [onlineName, setOnlineName] = useState('Max')
  const [onlineCode, setOnlineCode] = useState('')
  const [revealedStartCards, setRevealedStartCards] = useState<number[]>([])
  const [myDrawnCard, setMyDrawnCard] = useState<number | null>(null)
  const [revealedOpponentCard, setRevealedOpponentCard] = useState<{
    playerId: string
    cardIndex: number
  } | null>(null)
  const [selectedSpecialSwapCard, setSelectedSpecialSwapCard] = useState<number | null>(null)
  const [selectedOnlineSetCards, setSelectedOnlineSetCards] = useState<number[]>([])
  const [onlineSetMessage, setOnlineSetMessage] = useState('')
  const [isDeclaringOnlineSet, setIsDeclaringOnlineSet] = useState(false)
  const [onlineNextRoundCountdown, setOnlineNextRoundCountdown] = useState(10)

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server:', socket.id)
    })

    socket.on('lobby-created', (lobby: OnlineLobby) => {
      setOnlineLobby(lobby)
    })

    socket.on('lobby-updated', (lobby: OnlineLobby) => {
      setOnlineLobby(lobby)

      const ownPlayer = lobby.players.find((player) => player.id === socket.id)

      if (!ownPlayer || ownPlayer.drawnCard === null) {
        setMyDrawnCard(null)
        setIsDeclaringOnlineSet(false)
        setSelectedOnlineSetCards([])
      }
    })

    socket.on('game-started', (lobby: OnlineLobby) => {
      setOnlineLobby(lobby)
      setMyDrawnCard(null)
      setRevealedStartCards([])
      setRevealedOpponentCard(null)
      setSelectedSpecialSwapCard(null)
      setSelectedOnlineSetCards([])
      setOnlineSetMessage('')
      setIsDeclaringOnlineSet(false)
    })

    socket.on('draw-card-result', (card: number) => {
      setMyDrawnCard(card)
    })

    socket.on('lobby-error', (message: string) => {
      alert(message)
    })

    socket.on('set-error', (message: string) => {
      setOnlineSetMessage(message)
      setMyDrawnCard(null)
      setIsDeclaringOnlineSet(false)
      setSelectedOnlineSetCards([])

      setTimeout(() => {
        setOnlineSetMessage('')
      }, 2500)
    })

    return () => {
      socket.off('connect')
      socket.off('lobby-created')
      socket.off('lobby-updated')
      socket.off('lobby-error')
      socket.off('game-started')
      socket.off('draw-card-result')
      socket.off('set-error')
    }
  }, [])

  useEffect(() => {
    if (!onlineLobby || onlineLobby.phase !== 'round-over') {
      setOnlineNextRoundCountdown(10)
      return
    }

    setOnlineNextRoundCountdown(10)

    const countdownInterval = window.setInterval(() => {
      setOnlineNextRoundCountdown((currentValue) =>
        currentValue > 0 ? currentValue - 1 : 0
      )
    }, 1000)

    const nextRoundTimeout =
      socket.id === onlineLobby.hostId
        ? window.setTimeout(() => {
          socket.emit('start-next-round', onlineLobby.code)
        }, 10000)
        : undefined

    return () => {
      window.clearInterval(countdownInterval)

      if (nextRoundTimeout !== undefined) {
        window.clearTimeout(nextRoundTimeout)
      }
    }
  }, [onlineLobby?.phase, onlineLobby?.code, onlineLobby?.hostId])

  if (onlineLobby && onlineLobby.phase !== 'lobby') {
    const currentSocketId = socket.id
    const me = onlineLobby.players.find((player) => player.id === currentSocketId)
    const opponents = onlineLobby.players.filter((player) => player.id !== currentSocketId)
    const isMyTurn =
      onlineLobby.players[onlineLobby.currentPlayer]?.id === currentSocketId
    const isHighlighted = (
      playerId: string,
      cardIndex: number
    ) => {
      return onlineLobby.highlightedCards.some(
        (card) =>
          card.playerId === playerId &&
          card.cardIndex === cardIndex
      )
    }

    const statusMessage = () => {

      const caboCaller = onlineLobby.players.find(
        (player) => player.id === onlineLobby.caboCalledBy
      )

      if (caboCaller && onlineLobby.phase !== 'round-over' && onlineLobby.phase !== 'game-over') {
        return `📢 ${caboCaller.name} hat CABO angesagt. Mache deinen letzten Zug.`
      }

      if (onlineSetMessage) {
        return onlineSetMessage
      }

      if (myDrawnCard !== null) {
        return 'Wähle eine deiner Karten zum Tauschen oder wirf die gezogene Karte ab.'
      }

      if (onlineLobby.phase === 'memorize') return '🧠 Merke dir deine Karten.'
      if (onlineLobby.phase === 'action-choice' && isMyTurn) return '✨ Aktion nutzen oder überspringen.'
      if (onlineLobby.phase === 'peek-own' && isMyTurn) return '👀 Wähle eine eigene Karte zum Anschauen.'
      if (onlineLobby.phase === 'peek-opponent' && isMyTurn) return '👀 Wähle eine gegnerische Karte zum Anschauen.'

      if (onlineLobby.phase === 'special-swap' && isMyTurn) {
        return selectedSpecialSwapCard === null
          ? '🔁 Wähle zuerst eine eigene Karte.'
          : '🔁 Wähle jetzt eine gegnerische Karte zum Tauschen.'
      }

      return isMyTurn ? '🟢 Du bist am Zug.' : '⏳ Warte auf deinen Zug.'
    }

    if (onlineLobby.phase === 'round-over' || onlineLobby.phase === 'game-over') {

      const caboCaller = onlineLobby.players.find(
        (player) => player.id === onlineLobby.caboCalledBy
      )

      return (
        <main className="page">
          <section className="tableCard">
            <p className="eyebrow">Runde beendet</p>
            <h1>🏆 Rundenergebnis</h1>

            {onlineLobby.kamikazePlayerId && (
              <p className="caboBanner">
                💀 Kamikaze!{' '}
                {onlineLobby.players.find((player) => player.id === onlineLobby.kamikazePlayerId)?.name}
                {' '}hat zwei 12er und zwei 13er. Alle anderen erhalten 50 Punkte.
              </p>
            )}

            {caboCaller && !onlineLobby.kamikazePlayerId && (
              <p className="caboBanner">
                {onlineLobby.caboPenaltyApplied
                  ? `${caboCaller.name} hatte nicht die niedrigste Punktzahl und erhält deshalb 5 Strafpunkte.`
                  : `${caboCaller.name} hatte die niedrigste Punktzahl und erhält deshalb 0 Punkte.`}
              </p>
            )}

            <div className="scoreBoard">
              <h2>Rundenpunkte</h2>

              {onlineLobby.players.map((player, index) => (
                <p key={player.id}>
                  {player.name}: +{onlineLobby.roundScores[index] ?? 0}
                </p>
              ))}

              <hr />

              <h2>Gesamtstand</h2>

              {onlineLobby.players.map((player) => (
                <p key={player.id}>
                  {player.name}: {player.totalScore}
                </p>
              ))}

              {onlineLobby.phase === 'round-over' && socket.id === onlineLobby.hostId && (
                <button
                  className="primaryButton"
                  onClick={() => {
                    socket.emit('start-next-round', onlineLobby.code)
                  }}
                >
                  Nächste Runde ({onlineNextRoundCountdown})
                </button>
              )}

              {onlineLobby.phase === 'game-over' && (
                <div className="winnerBox">
                  <p className="eyebrow">Spiel beendet</p>
                  {(() => {
                    const lowestScore = Math.min(
                      ...onlineLobby.players.map((player) => player.totalScore)
                    )

                    const winners = onlineLobby.players.filter(
                      (player) => player.totalScore === lowestScore
                    )

                    return (
                      <>
                        <h1>
                          Gewinner:{' '}
                          {winners.map((player) => player.name).join(', ')}
                        </h1>

                        <p>
                          {winners.length === 1
                            ? `${winners[0]?.name} gewinnt mit ${lowestScore} Punkten.`
                            : `Gleichstand! ${winners.map((player) => player.name).join(', ')} gewinnen mit ${lowestScore} Punkten.`}
                        </p>

                        {socket.id === onlineLobby.hostId && (
                          <button
                            className="primaryButton"
                            onClick={() => {
                              socket.emit('start-new-game', onlineLobby.code)
                            }}
                          >
                            Neues Spiel starten
                          </button>
                        )}
                      </>
                    )
                  })()}
                </div>
              )}
            </div>
          </section>
        </main>
      )
    }

    return (
      <main className="page">
        <section className="tableCard">
          <h1>CABO 🎮</h1>

          <p className="caboBanner">
            {statusMessage()}
          </p>

          <div className="scoreBoard">

          </div>
          <div className="table">
            <div className="opponents">
              {opponents.map((player) => (
                <div className="playerBox" key={player.id}>
                  <p>{player.name}</p>

                  <div className="miniCardRow">
                    {player.cards.map((card, index) => (
                      <button
                        className={
                          isHighlighted(player.id, index)
                            ? 'gameCard small selected'
                            : 'gameCard small'
                        }
                        key={index}
                        onClick={() => {
                          if (onlineLobby.phase === 'special-swap' && isMyTurn) {
                            if (selectedSpecialSwapCard === null) return

                            socket.emit('highlight-target-card', {
                              code: onlineLobby.code,
                              playerId: player.id,
                              cardIndex: index,
                              type: 'swap',
                            })

                            socket.emit('special-swap', {
                              code: onlineLobby.code,
                              ownCardIndex: selectedSpecialSwapCard,
                              opponentId: player.id,
                              opponentCardIndex: index,
                            })

                            setSelectedSpecialSwapCard(null)
                            return
                          }

                          if (onlineLobby.phase !== 'peek-opponent') return
                          if (!isMyTurn) return

                          socket.emit('highlight-target-card', {
                            code: onlineLobby.code,
                            playerId: player.id,
                            cardIndex: index,
                            type: 'peek-opponent',
                          })

                          setRevealedOpponentCard({
                            playerId: player.id,
                            cardIndex: index,
                          })

                          setTimeout(() => {
                            setRevealedOpponentCard(null)
                            socket.emit('finish-peek-opponent', onlineLobby.code)
                          }, 3000)
                        }}
                      >
                        {revealedOpponentCard?.playerId === player.id &&
                          revealedOpponentCard.cardIndex === index
                          ? card
                          : '?'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="pileRow">
              <button
                className="pile"
                onClick={() => {
                  if (!isMyTurn) return
                  if (onlineLobby.phase !== 'turn') return
                  if (myDrawnCard !== null) return

                  socket.emit('draw-from-deck', onlineLobby.code)
                }}
              >
                <p>Nachziehstapel</p>
                <strong>🂠</strong>
              </button>

              <button
                className="pile"
                onClick={() => {
                  if (!isMyTurn) return
                  if (myDrawnCard === null) return

                  socket.emit('discard-drawn-card', onlineLobby.code)
                  setMyDrawnCard(null)
                }}
              >
                <p>Ablagestapel</p>
                <strong>
                  {onlineLobby.discardPile[onlineLobby.discardPile.length - 1]}
                </strong>
              </button>

              <div className="tableControlZone">
                <div className="tableControlSlot">
                  {myDrawnCard !== null && (
                    <div className="drawnTableCard">
                      <p>Gezogen</p>
                      <div className="gameCard drawnBigCard">
                        {myDrawnCard}
                      </div>

                      <button
                        className="secondaryButton setTableButton"
                        onClick={() => {
                          setIsDeclaringOnlineSet(true)
                          setSelectedOnlineSetCards([])
                          setOnlineSetMessage('')
                        }}
                      >
                        Satz gleicher Karten ablegen
                      </button>

                      {isDeclaringOnlineSet && (
                        <p className="caboBanner setTableHint">
                          Wähle 2–4 gleiche Karten aus deiner Hand.
                        </p>
                      )}

                      {isDeclaringOnlineSet && (
                        <button
                          className="primaryButton setTableButton"
                          disabled={selectedOnlineSetCards.length < 2}
                          onClick={() => {
                            socket.emit('declare-set', {
                              code: onlineLobby.code,
                              cardIndexes: selectedOnlineSetCards,
                            })

                            setIsDeclaringOnlineSet(false)
                            setSelectedOnlineSetCards([])
                            setMyDrawnCard(null)
                          }}
                        >
                          Satz bestätigen
                        </button>
                      )}
                    </div>
                  )}

                  {myDrawnCard === null && isMyTurn && onlineLobby.phase === 'action-choice' && (
                    <div className="tableActionBox">
                      <p>Sonderaktion</p>

                      <button
                        className="primaryButton"
                        onClick={() => {
                          const actionCard = onlineLobby.discardPile[onlineLobby.discardPile.length - 1]
                          if (actionCard === undefined) return

                          socket.emit('use-action', {
                            code: onlineLobby.code,
                            card: actionCard,
                          })
                        }}
                      >
                        Aktion nutzen
                      </button>

                      <button
                        className="secondaryButton"
                        onClick={() => {
                          socket.emit('skip-action', onlineLobby.code)
                        }}
                      >
                        Aktion überspringen
                      </button>
                    </div>
                  )}

                  {myDrawnCard === null &&
                    isMyTurn &&
                    onlineLobby.phase === 'turn' &&
                    onlineLobby.caboCalledBy === null && (
                      <div className="tableActionBox caboActionBox">
                        <button
                          className="dangerButton caboWideButton"
                          onClick={() => {
                            socket.emit('call-cabo', onlineLobby.code)
                          }}
                        >
                          CABO ansagen
                        </button>
                      </div>
                    )}
                </div>
              </div>


            </div>

            <div className="playerBox active">
              <p>Deine Karten</p>

              <div className="cardRow">
                {me?.cards.map((card, index) => (
                  <button
                    className={
                      isDeclaringOnlineSet && selectedOnlineSetCards.includes(index)
                        ? 'gameCard selected'
                        : currentSocketId && isHighlighted(currentSocketId, index)
                          ? 'gameCard selected'
                          : 'gameCard'
                    }
                    key={index}
                    onClick={() => {
                      if (isDeclaringOnlineSet && isMyTurn && myDrawnCard !== null) {
                        if (selectedOnlineSetCards.includes(index)) {
                          setSelectedOnlineSetCards(
                            selectedOnlineSetCards.filter((cardIndex) => cardIndex !== index)
                          )
                          return
                        }

                        if (selectedOnlineSetCards.length >= 4) return

                        setSelectedOnlineSetCards([...selectedOnlineSetCards, index])
                        return
                      }

                      if (onlineLobby.phase === 'special-swap' && isMyTurn) {
                        setSelectedSpecialSwapCard(index)

                        socket.emit('highlight-card', {
                          code: onlineLobby.code,
                          cardIndex: index,
                          type: 'swap',
                        })

                        return
                      }

                      if (onlineLobby.phase === 'peek-own' && isMyTurn) {
                        setRevealedStartCards([index])

                        socket.emit('highlight-card', {
                          code: onlineLobby.code,
                          cardIndex: index,
                          type: 'peek-own',
                        })

                        setTimeout(() => {
                          setRevealedStartCards([])
                          socket.emit('finish-peek-own', onlineLobby.code)
                        }, 3000)

                        return
                      }

                      if (myDrawnCard !== null && isMyTurn) {
                        socket.emit('swap-card', {
                          code: onlineLobby.code,
                          cardIndex: index,
                        })

                        setMyDrawnCard(null)
                        return
                      }

                      if (onlineLobby.phase !== 'memorize') return
                      if (revealedStartCards.includes(index)) return
                      if (revealedStartCards.length >= 2) return

                      socket.emit('highlight-card', {
                        code: onlineLobby.code,
                        cardIndex: index,
                        type: 'memorize',
                      })

                      const newCards = [...revealedStartCards, index]

                      setRevealedStartCards(newCards)

                      if (newCards.length === 2) {
                        setTimeout(() => {
                          setRevealedStartCards([])
                          socket.emit('start-cards-done', onlineLobby.code)
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
        <p className="subtitle">Online-Version mit Lobbycode.</p>

        <div className="scoreBoard">
          <h2>Online spielen</h2>

          <input
            placeholder="Name"
            value={onlineName}
            onChange={(event) => setOnlineName(event.target.value)}
          />

          <button
            className="primaryButton"
            onClick={() => {
              socket.emit('create-lobby', onlineName || 'Max')
            }}
          >
            Online-Lobby erstellen
          </button>
        </div>

        <div className="scoreBoard">
          <h2>Lobby beitreten</h2>

          <input
            placeholder="Lobby-Code"
            value={onlineCode}
            onChange={(event) => setOnlineCode(event.target.value.toUpperCase())}
          />

          <button
            className="secondaryButton"
            onClick={() => {
              socket.emit('join-lobby', {
                code: onlineCode,
                playerName: onlineName || 'Gast',
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

            {socket.id === onlineLobby.hostId && (
              <button
                className="primaryButton"
                onClick={() => {
                  socket.emit('start-game', onlineLobby.code)
                }}
              >
                Online-Spiel starten
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  )
}

export default App