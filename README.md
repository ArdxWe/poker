# Texas Hold'em Poker Club

A small web app for recording casual Texas Hold'em games among friends: who bought in, how many chips they left with, and how that ranks over time.

**Live:** https://ardxwe-table.netlify.app/

## What it does

- Seat players at a table and set the **one buy-in** chip amount
- Track each player's **buy-in count** and **chips left**
- Auto-calc net (`chips left − buy-ins × one buy-in`) and keep the table balanced
- **Record** a finished game into the club history
- Rank players by cumulative chips won / lost
- Browse past games
- **Share** a finished game with a link (read-only; data rides in the URL, nothing is uploaded)

All club data stays in this browser (`localStorage`). Clearing site data or switching devices loses it. A shared link only carries that one game.

## What it does not do

- No accounts or cloud sync of the whole club
- No payments, cash-out, or rake
- Not for organizing gambling — casual friends-only use

## Develop

```bash
npm install
npm test
npm run dev
npm run build
```

## Deploy (Netlify)

Static site — no server. Hosted on Netlify.

- Site URL: https://ardxwe-table.netlify.app/
- Build command: `npm run build`
- Publish directory: `dist`
- Production branch: `main`

Push to `main` rebuilds and publishes automatically.

## Todo

- [ ] Ship Android and iOS apps
