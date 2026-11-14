import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import {
  chipsLeft,
  formatAmount,
  formatSigned,
  newId,
  playerNet,
  playersByNet,
  recordGame,
  standings,
  summarize,
  wholeNumber,
  type Game,
  type Session,
} from './ledger'
import {
  buildClubShareUrl,
  buildShareUrl,
  clearShareHash,
  decodeClubShare,
  decodeGameShare,
  readClubTokenFromLocation,
  readShareTokenFromLocation,
} from './share'
import { generatePassword, type ClubRecord } from './clubs'
import { CloudOfflineError } from './cloud'
import { clearLegacyGames, createBrowserClubClient, legacyClubName, legacyGames } from './serverClient'
import { loadSession, saveSession } from './storage'

const clubClient = createBrowserClubClient()

function PlayedAt({ playedAt }: { playedAt: string }) {
  const date = new Date(playedAt)
  const day = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const clock = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return (
    <time className="when" dateTime={playedAt}>
      <span className="when-day">{day}</span>
      <span className="when-sep">{' '}</span>
      <span className="when-clock">{clock}</span>
    </time>
  )
}

function readSharedGame(): Game | null {
  const token = readShareTokenFromLocation()
  return token ? decodeGameShare(token) : null
}

function readSharedClub(): Game[] | null {
  const token = readClubTokenFromLocation()
  return token ? decodeClubShare(token) : null
}

export function App() {
  const [page, setPage] = useState<'club' | 'game'>('club')
  const [openGameId, setOpenGameId] = useState<string | null>(null)
  const [sharedGame, setSharedGame] = useState<Game | null>(readSharedGame)
  const [sharedClub, setSharedClub] = useState<Game[] | null>(readSharedClub)
  const [openSharedGameId, setOpenSharedGameId] = useState<string | null>(null)
  const [confirmingGameId, setConfirmingGameId] = useState<string | null>(null)
  const [shareFlash, setShareFlash] = useState('')
  const [session, setSession] = useState<Session>(loadSession)
  const [opened, setOpened] = useState<ClubRecord | null>(() => clubClient.cached())
  const [booting, setBooting] = useState(() => clubClient.hasSession() && clubClient.cached() === null)
  const [offline, setOffline] = useState(false)
  const [phoneGames, setPhoneGames] = useState<Game[]>(legacyGames)
  const [askingPassword, setAskingPassword] = useState(() => !clubClient.hasSession())
  const [readPassword, setReadPassword] = useState('')
  const [newClubName, setNewClubName] = useState(() => (legacyGames().length > 0 ? legacyClubName() : ''))
  const [doorMessage, setDoorMessage] = useState('')
  const [creating, setCreating] = useState(true)
  const [writeError, setWriteError] = useState('')
  const [issued, setIssued] = useState<{ password: string } | null>(null)
  const [copiedPassword, setCopiedPassword] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [gameName, setGameName] = useState('')
  const [namingGame, setNamingGame] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const clubScroll = useRef(0)

  useEffect(() => {
    saveSession(session)
  }, [session])

  useEffect(() => {
    let live = true
    clubClient.restore().then((club) => {
      if (!live) return
      setOpened(club)
      setAskingPassword(club === null)
      setOffline(false)
      setBooting(false)
    }).catch((error: unknown) => {
      if (!live) return
      if (error instanceof CloudOfflineError) setOffline(true)
      setAskingPassword(true)
      setBooting(false)
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible' || !opened) return
      void clubClient.refresh(opened).then((club) => {
        setOpened(club)
        setOffline(false)
      }).catch((error: unknown) => {
        if (error instanceof CloudOfflineError) setOffline(true)
      })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [opened])

  useEffect(() => {
    function onHashChange() {
      setSharedGame(readSharedGame())
      setSharedClub(readSharedClub())
      setOpenSharedGameId(null)
      setConfirmingGameId(null)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useLayoutEffect(() => {
    const showingGame =
      sharedGame !== null || openSharedGameId !== null || (sharedClub === null && page === 'club' && openGameId !== null)
    window.scrollTo(0, showingGame || page === 'game' ? 0 : clubScroll.current)
  }, [page, openGameId, sharedGame, sharedClub, openSharedGameId])

  const summary = summarize(session)
  const club = opened?.games ?? []
  const openGame = club.find((game) => game.id === openGameId) ?? null
  const sharedClubGame = sharedClub?.find((game) => game.id === openSharedGameId) ?? null
  const shownClub = sharedClub ?? club
  const ranks = standings(shownClub)
  const roster = standings(club).map((row) => row.name)
  const seated = new Set(session.players.map((player) => player.name.trim().toLocaleLowerCase()))
  const availableNames = roster.filter((name) => !seated.has(name.toLocaleLowerCase()))
  const canRecord = session.players.some((player) => player.name.trim() && player.left !== null)

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
          { id: newId(), name: trimmed, buyIns: 1, left: null },
        ],
      }
    })
    setDraftName('')
    setNamingGame(false)
    setConfirmingClear(false)
  }

  function addPlayer(event: FormEvent) {
    event.preventDefault()
    seatPlayer(draftName)
  }

  function updatePlayer(id: string, patch: { buyIns?: number; left?: number | null; name?: string }) {
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

  function setBuyIns(id: string, raw: string) {
    const parsed = chipsLeft(raw)
    if (parsed === null) return
    updatePlayer(id, { buyIns: parsed })
  }

  function setLeft(id: string, raw: string) {
    if (raw === '') {
      updatePlayer(id, { left: null })
      return
    }
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

  function beginSave() {
    if (!canRecord) return
    setConfirmingClear(false)
    setNamingGame(true)
  }

  function cancelSave() {
    setNamingGame(false)
    setGameName('')
  }

  async function recordHand() {
    const game = recordGame(session, new Date().toISOString(), newId(), gameName)
    if (!game) return
    if (opened) {
      const saved = await clubClient.saveGame(opened, game, '')
      if (!saved.ok) {
        setWriteError('Could not save. This game is still here.')
        return
      }
      setOpened(saved.club)
      setOffline(false)
    } else {
      setWriteError('Create a club before saving this game.')
      return
    }
    setWriteError('')
    setGameName('')
    setNamingGame(false)
    setConfirmingClear(false)
    setOpenGameId(null)
    setPage('club')
    setSession((current) => ({
      ...current,
      players: current.players
        .filter((player) => player.name.trim())
        .map((player) => ({ ...player, buyIns: 1, left: current.oneBuyIn })),
    }))
  }

  async function removeGame(id: string) {
    if (opened) {
      const removed = await clubClient.deleteGame(opened, id, '')
      if (!removed.ok) {
        setWriteError('Could not remove that game.')
        return
      }
      setOpened(removed.club)
      setOffline(false)
    } else {
      return
    }
    setWriteError('')
    setConfirmingGameId(null)
    if (openGameId === id) setOpenGameId(null)
  }

  async function openClubDoor(event: FormEvent) {
    event.preventDefault()
    try {
      const clubRecord = await clubClient.open(readPassword)
      if (!clubRecord) {
        setDoorMessage('No club for that password.')
        return
      }
      setOpened(clubRecord)
      setAskingPassword(false)
      setDoorMessage('')
      setReadPassword('')
      setOffline(false)
    } catch {
      setDoorMessage('Could not open the club. Try again.')
    }
  }

  async function createClubDoor(event: FormEvent) {
    event.preventDefault()
    if (!newClubName.trim()) {
      setDoorMessage('Add a club name.')
      return
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const password = generatePassword()
      let created: Awaited<ReturnType<typeof clubClient.create>>
      try {
        created = await clubClient.create({
          name: newClubName,
          readPassword: password,
          writePassword: password,
          games: phoneGames,
        })
      } catch {
        setDoorMessage('Could not create the club. Try again.')
        return
      }
      if (!created.ok) {
        if (created.reason === 'name') {
          setDoorMessage('That club name is already used.')
          return
        }
        if (created.reason === 'empty') {
          setDoorMessage('Add a club name.')
          return
        }
        if (created.reason === 'failed') {
          setDoorMessage('Could not create the club. Try again.')
          return
        }
        continue
      }
      const uploaded = phoneGames.every((game) => created.club.games.some((saved) => saved.id === game.id))
      if (uploaded) {
        clearLegacyGames()
        setPhoneGames([])
      }
      setOpened(created.club)
      setIssued({ password })
      setAskingPassword(false)
      setCreating(true)
      setDoorMessage('')
      setReadPassword('')
      setNewClubName('')
      setOffline(false)
      return
    }
    setDoorMessage('Could not create the club. Try again.')
  }

  function switchClub() {
    setAskingPassword(true)
    setCreating(true)
    setPage('club')
    setOpenGameId(null)
    setDoorMessage('')
    setWriteError('')
  }

  function leaveDoor() {
    setAskingPassword(false)
    setCreating(true)
    setDoorMessage('')
  }

  function showCreateClub() {
    setCreating(true)
    setDoorMessage('')
  }

  function showOpenClub() {
    setCreating(false)
    setDoorMessage('')
  }

  function showClub() {
    setSharedGame(null)
    setSharedClub(null)
    setOpenSharedGameId(null)
    clearShareHash()
    setShareFlash('')
    setOpenGameId(null)
    setPage('club')
  }

  function showNewGame() {
    if (booting || !opened) return
    clubScroll.current = 0
    setSharedGame(null)
    setSharedClub(null)
    setOpenSharedGameId(null)
    clearShareHash()
    setShareFlash('')
    setOpenGameId(null)
    setPage('game')
  }

  function openGameDetail(id: string) {
    clubScroll.current = window.scrollY
    setConfirmingGameId(null)
    if (sharedClub) {
      setOpenSharedGameId(id)
      return
    }
    setSharedGame(null)
    clearShareHash()
    setShareFlash('')
    setOpenGameId(id)
    setPage('club')
  }

  function showSharedClub() {
    setOpenSharedGameId(null)
    setShareFlash('')
  }

  function closeSharedView() {
    setSharedGame(null)
    setSharedClub(null)
    setOpenSharedGameId(null)
    clearShareHash()
    setShareFlash('')
    setPage('club')
  }

  async function copyPassword(value: string) {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      window.prompt('Copy this password', value)
    }
    setCopiedPassword(true)
  }

  async function copyShareLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setShareFlash('Link copied')
    } catch {
      window.prompt('Copy this link', url)
      setShareFlash('Copy the link')
    }
  }

  function shareOpenGame() {
    if (!openGame) return
    void copyShareLink(buildShareUrl(openGame))
  }

  function shareClub() {
    const url = buildClubShareUrl(club)
    if (!url) {
      setShareFlash('Too big')
      return
    }
    setConfirmingGameId(null)
    void copyShareLink(url)
  }

  const viewingGame = sharedClub === null && page === 'club' && openGame !== null
  const displayedGame = sharedGame ?? sharedClubGame ?? (viewingGame ? openGame : null)
  const isSharedView = sharedGame !== null || sharedClub !== null

  return (
    <main className="sheet">
      <div className="frame">
      <header>
        <h1 className={displayedGame ? (displayedGame.title ? 'dated' : 'dated untitled') : 'home'}>
          {displayedGame ? (
            displayedGame.title || <PlayedAt playedAt={displayedGame.playedAt} />
          ) : askingPassword ? (
            'Poker club'
          ) : page === 'game' && !sharedClub ? (
            'New game'
          ) : opened && !sharedClub ? (
            opened.name
          ) : (
            'Poker club'
          )}
        </h1>
        {displayedGame ? (
          <button
            type="button"
            className="nav-link"
            onClick={sharedClub && !sharedGame ? showSharedClub : isSharedView ? closeSharedView : showClub}
          >
            {sharedClub && !sharedGame ? '← Club' : isSharedView ? '← Open app' : '← My club'}
          </button>
        ) : sharedClub ? (
          <button type="button" className="nav-link" onClick={closeSharedView}>
            ← Open app
          </button>
        ) : askingPassword && !creating ? (
          <button type="button" className="nav-link" onClick={showCreateClub}>
            Back
          </button>
        ) : askingPassword ? (
          <button type="button" className="nav-link" onClick={showOpenClub}>
            Open club
          </button>
        ) : issued ? null : page === 'game' ? (
          <button type="button" className="nav-link" onClick={showClub}>
            My club
          </button>
        ) : (
          <div className="header-actions">
            {opened && !sharedClub ? (
              <button type="button" className="nav-link" onClick={switchClub}>
                Switch club
              </button>
            ) : null}
            <button type="button" className="new-game" onClick={showNewGame}>
              New game
            </button>
          </div>
        )}
      </header>

      {displayedGame ? (
        <section className="history">
          {isSharedView ? <p className="share-note">Shared game · read only</p> : null}
          {displayedGame.title ? (
            <p className="played-at">
              <PlayedAt playedAt={displayedGame.playedAt} />
            </p>
          ) : null}
          <div className="unit">
            <span>One buy-in</span>
            <span className="unit-end">
              <strong>{formatAmount(displayedGame.oneBuyIn)}</strong>
              {!isSharedView ? (
                <button type="button" className="share" onClick={shareOpenGame}>
                  {shareFlash || 'Share'}
                </button>
              ) : null}
            </span>
          </div>
          <div className="board">
            <div className="hand-columns" aria-hidden="true">
              <span>Name</span>
              <span>Buy-ins</span>
              <span>Left</span>
              <span>Net</span>
            </div>
            <ul className="hand">
              {playersByNet(displayedGame.players).map((player) => {
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
          </div>
        </section>
      ) : askingPassword && !sharedClub ? (
        <section className="door">
          {creating ? (
            <form onSubmit={createClubDoor}>
              <label>
                Club name
                <input value={newClubName} onChange={(event) => setNewClubName(event.target.value)} />
              </label>
              <p className="share-note">
                {phoneGames.length > 0
                  ? phoneGames.length === 1
                    ? 'Saves 1 game from this phone.'
                    : `Saves ${phoneGames.length} games from this phone.`
                  : 'A password is created for you.'}
              </p>
              <button type="submit" className="record">
                Create club
              </button>
              {opened ? (
                <button type="button" className="nav-link" onClick={leaveDoor}>
                  Back
                </button>
              ) : null}
            </form>
          ) : (
            <form onSubmit={openClubDoor}>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={readPassword}
                  onChange={(event) => setReadPassword(event.target.value)}
                />
              </label>
              <button type="submit" className="record">
                Open club
              </button>
            </form>
          )}
          {doorMessage ? <p className="share-note">{doorMessage}</p> : null}
        </section>
      ) : issued && !sharedClub ? (
        <section className="pass-page">
          <p className="share-note">Shown once. Save it.</p>
          <p className="pass-code">
            <strong>{issued.password}</strong>
            <button type="button" className="nav-link" onClick={() => void copyPassword(issued.password)}>
              {copiedPassword ? 'Copied' : 'Copy'}
            </button>
          </p>
          <button
            type="button"
            className="record"
            onClick={() => {
              setIssued(null)
              setCopiedPassword(false)
            }}
          >
            Enter club
          </button>
        </section>
      ) : page === 'club' || sharedClub ? (
        <section className="club">
          {!sharedClub && opened && offline ? (
            <p className="share-note">Could not reach the server. Showing the last saved games.</p>
          ) : null}
          {!sharedClub && booting && !opened ? (
            <p className="empty">Opening club…</p>
          ) : shownClub.length === 0 ? (
            <p className="empty">No games yet</p>
          ) : (
            <>
              {sharedClub ? <p className="share-note">Shared club · read only</p> : null}
              <div className="board">
                <div className="standings-head">
                  <h2>Ranking</h2>
                  <span>Games</span>
                  <span>Net</span>
                </div>
                <ol className="standings">
                  {ranks.map((row) => {
                    const tone = row.net > 0 ? 'up' : row.net < 0 ? 'down' : 'even'
                    return (
                      <li key={row.name.toLocaleLowerCase()}>
                        <span className="standing-name">{row.name}</span>
                        <span className="games-played">{row.games}</span>
                        <span className={tone}>{formatSigned(row.net)}</span>
                      </li>
                    )
                  })}
                </ol>
              </div>
              <div className="board">
                <div className="board-title">
                  <h2>Game history</h2>
                  {sharedClub || !opened ? null : (
                    <button type="button" className="nav-link" onClick={shareClub}>
                      {shareFlash || 'Share'}
                    </button>
                  )}
                </div>
                <ul className={sharedClub ? 'games readonly' : 'games'}>
                {shownClub.map((game) => (
                  <li key={game.id}>
                    {!sharedClub && confirmingGameId === game.id ? (
                      <form
                        className="confirm row-confirm"
                        onSubmit={(event) => {
                          event.preventDefault()
                          void removeGame(game.id)
                        }}
                      >
                        <p>Remove this game?</p>
                        {writeError ? <p className="share-note">{writeError}</p> : null}
                        <button type="submit" className="danger">
                          Remove
                        </button>
                        <button
                          type="button"
                          className="cancel"
                          onClick={() => {
                            setConfirmingGameId(null)
                            setWriteError('')
                          }}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <button type="button" className="open-game" onClick={() => openGameDetail(game.id)}>
                          {game.title ? <span className="game-title">{game.title}</span> : null}
                          <PlayedAt playedAt={game.playedAt} />
                        </button>
                        {sharedClub || !opened ? null : (
                          <button type="button" className="remove" onClick={() => setConfirmingGameId(game.id)}>
                            Remove
                          </button>
                        )}
                      </>
                    )}
                  </li>
                ))}
                </ul>
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="game-page">
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
                const tone = net === null ? 'even' : net > 0 ? 'up' : net < 0 ? 'down' : 'even'
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
                      <input
                        aria-label={`Buy-ins for ${player.name}`}
                        inputMode="numeric"
                        min={0}
                        step={1}
                        type="number"
                        value={player.buyIns}
                        onChange={(event) => setBuyIns(player.id, event.target.value)}
                      />
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
                        value={player.left ?? ''}
                        onChange={(event) => setLeft(player.id, event.target.value)}
                      />
                    </label>
                    <p className={`net ${tone}`}>{net === null ? '—' : formatSigned(net)}</p>
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
              <dd className={summary.offBy > 0 ? 'up' : summary.offBy < 0 ? 'down' : 'even'}>
                {formatSigned(summary.offBy)}
              </dd>
            </div>
          </dl>

          <div className="actions">
            {namingGame ? (
              <form
                className="save-name"
                onSubmit={(event) => {
                  event.preventDefault()
                  recordHand()
                }}
              >
                <input
                  aria-label="Game name"
                  autoFocus
                  placeholder="Game name (optional)"
                  value={gameName}
                  onChange={(event) => setGameName(event.target.value)}
                />
                <button type="submit" className="record" disabled={!canRecord}>
                  Save
                </button>
                <button type="button" className="cancel" onClick={cancelSave}>
                  Cancel
                </button>
                {writeError ? <p className="share-note">{writeError}</p> : null}
              </form>
            ) : confirmingClear ? (
              <div className="confirm">
                <p>Clear all players?</p>
                <button type="button" className="danger" onClick={clearPlayers}>
                  Clear
                </button>
                <button type="button" className="cancel" onClick={() => setConfirmingClear(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button type="button" className="record" disabled={!canRecord} onClick={beginSave}>
                  Save game
                </button>
                <button
                  type="button"
                  className="clear"
                  disabled={session.players.length === 0}
                  onClick={() => setConfirmingClear(true)}
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </section>
      )}
      </div>
    </main>
  )
}
