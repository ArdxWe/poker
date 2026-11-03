import { useEffect, useState, type FormEvent } from 'react'
import { formatAmount, formatSigned, playerNet, summarize, wholeNumber, type Session } from './ledger'
import { loadSession, saveSession } from './storage'

export function App() {
  const [session, setSession] = useState<Session>(loadSession)
  const [draftName, setDraftName] = useState('')
  const [confirmingClear, setConfirmingClear] = useState(false)

  useEffect(() => {
    saveSession(session)
  }, [session])

  const summary = summarize(session)

  function setOneBuyIn(raw: string) {
    const parsed = wholeNumber(Number(raw))
    if (parsed === null || parsed < 1) return
    setSession((current) => ({ ...current, oneBuyIn: parsed }))
  }

  function addPlayer(event: FormEvent) {
    event.preventDefault()
    const name = draftName.trim()
    if (!name) return
    setSession((current) => ({
      ...current,
      players: [
        ...current.players,
        {
          id: crypto.randomUUID(),
          name,
          buyIns: 1,
          left: current.oneBuyIn,
        },
      ],
    }))
    setDraftName('')
    setConfirmingClear(false)
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
    const parsed = wholeNumber(Number(raw))
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

  return (
    <main className="sheet">
      <header>
        <h1>Table</h1>
      </header>

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
    </main>
  )
}
