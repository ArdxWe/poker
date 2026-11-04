import { useEffect, useState, type FormEvent } from 'react'
import {
  chipsLeft,
  formatAmount,
  formatSigned,
  newId,
  playerNet,
  recordGame,
  standings,
  summarize,
  wholeNumber,
  type Game,
  type Session,
} from './ledger'
import { loadClub, loadSession, saveClub, saveSession } from './storage'

function formatPlayedAt(playedAt: string): string {
  return new Date(playedAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function App() {
  const [page, setPage] = useState<'club' | 'game' | 'history'>('club')
  const [openGameId, setOpenGameId] = useState<string | null>(null)
  const [session, setSession] = useState<Session>(loadSession)
  const [club, setClub] = useState<Game[]>(loadClub)
  const [draftName, setDraftName] = useState('')
  const [gameName, setGameName] = useState('')
  const [confirmingClear, setConfirmingClear] = useState(false)

  useEffect(() => {
    saveSession(session)
  }, [session])

  useEffect(() => {
    saveClub(club)
  }, [club])

  const summary = summarize(session)
  const ranks = standings(club)
  const roster = ranks.map((row) => row.name)
  const seated = new Set(session.players.map((player) => player.name.trim().toLocaleLowerCase()))
  const availableNames = roster.filter((name) => !seated.has(name.toLocaleLowerCase()))
  const canRecord = session.players.some((player) => player.name.trim())
  const openGame = club.find((game) => game.id === openGameId) ?? null

  function setOneBuyIn(raw: string) {
    const parsed = wholeNumber(Number(raw))
    if (parsed === null || parsed < 1) return
    setSession((current) => ({ ...current, oneBuyIn: parsed }))
  }

  function seatPlayer(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const key = trimmed.toLocaleLowerCase()
    setSession((current) => {
      if (current.players.some((player) => player.name.trim().toLocaleLowerCase() === key)) return current
      return {
        ...current,
        players: [
          ...current.players,
          { id: newId(), name: trimmed, buyIns: 1, left: current.oneBuyIn },
        ],
      }
    })
    setDraftName('')
    setConfirmingClear(false)
  }

  function addPlayer(event: FormEvent) {
    event.preventDefault()
    seatPlayer(draftName)
  }

  function updatePlayer(id: string, patch: { buyIns?: number; left?: number; name?: string }) {
    setSession((current) => ({
      ...current,
      players: current.players.map((player) => (player.id === id ? { ...player, ...patch } : player)),
    }))
  }

  function changeBuyIns(id: string, buyIns: number, delta: number) {
    const next = wholeNumber(buyIns + delta)
    if (next === null) return
    updatePlayer(id, { buyIns: next })
  }

  function setLeft(id: string, raw: string) {
    const parsed = chipsLeft(raw)
    if (parsed === null) return
    updatePlayer(id, { left: parsed })
  }

  function removePlayer(id: string) {
    setSession((current) => ({
      ...current,
      players: current.players.filter((player) => player.id !== id),
    }))
  }

  function clearPlayers() {
    setSession((current) => ({ ...current, players: [] }))
    setConfirmingClear(false)
  }

  function recordHand() {
    const game = recordGame(session, new Date().toISOString(), newId(), gameName)
    if (!game) return
    setClub((current) => [game, ...current])
    setGameName('')
    setPage('club')
    setSession((current) => ({
      ...current,
      players: current.players
        .filter((player) => player.name.trim())
        .map((player) => ({ ...player, buyIns: 1, left: current.oneBuyIn })),
    }))
  }

  function removeGame(id: string) {
    setClub((current) => current.filter((game) => game.id !== id))
    if (openGameId === id) {
      setOpenGameId(null)
      setPage('club')
    }
  }

  function showClub() {
    setOpenGameId(null)
    setPage('club')
  }

  function showGame(id: string) {
    setOpenGameId(id)
    setPage('history')
  }

  return (
    <main className="sheet">
      <header>
        <h1 className={page === 'history' && openGame ? 'dated' : page === 'club' ? 'home' : undefined}>
          {page === 'history' && openGame
            ? openGame.title || formatPlayedAt(openGame.playedAt)
            : page === 'game'
              ? 'New game'
              : "Texas Hold'em Poker Club"}
        </h1>
        <nav className="views">
          <button type="button" aria-current={page === 'club' ? 'page' : undefined} onClick={showClub}>
            My club
          </button>
          <button type="button" aria-current={page === 'game' ? 'page' : undefined} onClick={() => setPage('game')}>
            New game
          </button>
        </nav>
      </header>

      {page === 'history' && openGame ? (
        <section className="history">
          {openGame.title && (
            <p className="played-at">
              <time dateTime={openGame.playedAt}>{formatPlayedAt(openGame.playedAt)}</time>
            </p>
          )}
          <p className="unit">
            <span>One buy-in</span>
            <strong>{formatAmount(openGame.oneBuyIn)}</strong>
          </p>
          <div className="hand-columns" aria-hidden="true">
            <span>Name</span>
            <span>Buy-ins</span>
            <span>Left</span>
            <span>Net</span>
          </div>
          <ul className="hand">
            {openGame.players.map((player) => {
              const tone = player.net > 0 ? 'up' : player.net < 0 ? 'down' : 'even'
              return (
                <li key={player.name.toLocaleLowerCase()}>
                  <span>{player.name}</span>
                  <span>{player.buyIns}</span>
                  <span>{formatAmount(player.left)}</span>
                  <span className={tone}>{formatSigned(player.net)}</span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : page === 'club' ? (
        <section className="club">
          {club.length === 0 ? (
            <p className="empty">No games yet</p>
          ) : (
            <>
              <h2>Ranking</h2>
              <ol className="standings">
                {ranks.map((row) => {
                  const tone = row.net > 0 ? 'up' : row.net < 0 ? 'down' : 'even'
                  return (
                    <li key={row.name.toLocaleLowerCase()}>
                      <span>{row.name}</span>
                      <span className={tone}>{formatSigned(row.net)}</span>
                    </li>
                  )
                })}
              </ol>
              <h2>Games</h2>
              <ul className="games">
                {club.map((game) => (
                  <li key={game.id}>
                    <button type="button" className="open-game" onClick={() => showGame(game.id)}>
                      {game.title ? <span className="game-title">{game.title}</span> : null}
                      <time dateTime={game.playedAt}>{formatPlayedAt(game.playedAt)}</time>
                    </button>
                    <span>
                      {game.players.length} {game.players.length === 1 ? 'player' : 'players'}
                    </span>
                    <button type="button" className="remove" onClick={() => removeGame(game.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : (
        <>
      <label className="unit">
        <span>One buy-in</span>
        <input
          inputMode="numeric"
          min={1}
          step={1}
          type="number"
          value={session.oneBuyIn}
          onChange={(event) => setOneBuyIn(event.target.value)}
        />
      </label>

      <div className="ledger">
        {session.players.length > 0 && (
          <div className="columns" aria-hidden="true">
            <span>Name</span>
            <span>Buy-ins</span>
            <span>Left</span>
            <span>Net</span>
            <span />
          </div>
        )}
        <ul className="players">
          {session.players.map((player) => {
            const net = playerNet(player, session.oneBuyIn)
            const tone = net > 0 ? 'up' : net < 0 ? 'down' : 'even'
            return (
              <li key={player.id} className="player">
                <input
                  aria-label={`Name for ${player.name || 'player'}`}
                  className="name"
                  value={player.name}
                  onChange={(event) => updatePlayer(player.id, { name: event.target.value })}
                />
                <div className="stepper">
                  <button
                    type="button"
                    aria-label={`Remove a buy-in from ${player.name}`}
                    onClick={() => changeBuyIns(player.id, player.buyIns, -1)}
                  >
                    −
                  </button>
                  <strong>{player.buyIns}</strong>
                  <button
                    type="button"
                    aria-label={`Add a buy-in for ${player.name}`}
                    onClick={() => changeBuyIns(player.id, player.buyIns, 1)}
                  >
                    +
                  </button>
                </div>
                <label className="left">
                  <input
                    aria-label={`Chips left for ${player.name}`}
                    inputMode="numeric"
                    min={0}
                    step={1}
                    type="number"
                    value={player.left}
                    onChange={(event) => setLeft(player.id, event.target.value)}
                  />
                </label>
                <p className={`net ${tone}`}>{formatSigned(net)}</p>
                <button type="button" className="remove" onClick={() => removePlayer(player.id)}>
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <form className="add" onSubmit={addPlayer}>
        {availableNames.length > 0 && (
          <select
            aria-label="Saved players"
            value=""
            onChange={(event) => {
              seatPlayer(event.target.value)
            }}
          >
            <option value="">Saved players</option>
            {availableNames.map((name) => (
              <option key={name.toLocaleLowerCase()} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
        <input
          aria-label="Player name"
          placeholder="Name"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
        />
        <button type="submit">Add</button>
      </form>

      <dl className="summary">
        <div>
          <dt>Total buy-ins</dt>
          <dd>{formatAmount(summary.totalBuyIns)}</dd>
        </div>
        <div>
          <dt>Total in</dt>
          <dd>{formatAmount(summary.totalIn)}</dd>
        </div>
        <div>
          <dt>Total left</dt>
          <dd>{formatAmount(summary.totalLeft)}</dd>
        </div>
        <div>
          <dt>Off by</dt>
          <dd className={summary.offBy === 0 ? 'even' : 'down'}>{formatSigned(summary.offBy)}</dd>
        </div>
      </dl>

      <label className="game-name">
        <span>Game name</span>
        <input
          aria-label="Game name"
          placeholder="Friday night"
          value={gameName}
          onChange={(event) => setGameName(event.target.value)}
        />
      </label>

      <div className="actions">
        <button type="button" className="record" disabled={!canRecord} onClick={recordHand}>
          Save game
        </button>
        {confirmingClear ? (
          <div className="confirm">
            <p>Clear all players?</p>
            <button type="button" onClick={clearPlayers}>
              Clear
            </button>
            <button type="button" className="cancel" onClick={() => setConfirmingClear(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="clear"
            disabled={session.players.length === 0}
            onClick={() => setConfirmingClear(true)}
          >
            Clear
          </button>
        )}
      </div>
        </>
      )}
    </main>
  )
}
