# QuizLive — self-hosted live quiz platform

Host controls everything; participants join by 5-character code or QR scan; one answer per question; live leaderboard and "who answered correctly first" per question.

## Run
```bash
npm install
ADMIN_PASSWORD=choose-a-password npm start     # Windows PowerShell: $env:ADMIN_PASSWORD="..."; npm start
```
- Host: open `http://localhost:3000/#host` and sign in.
- Participants: open `http://<your-server>:3000/`, or scan the QR / use the code shown on the host screen.
- Phones must be able to reach the server (same Wi-Fi + your computer's LAN IP, or deploy publicly).
- The QR camera scanner needs **HTTPS** (or localhost). Deploy behind HTTPS (Render, Railway, Fly.io, or `ngrok http 3000` for quick tests). Typing the code always works.

## Files
- `server.js` — Express + WebSocket server. Holds correct answers privately, enforces one answer per question, timestamps answers on the server, computes scores. State persists in `data.json`.
- `public/index.html` — participant and host UI (host at `/#host`).
- `package.json` — dependencies (`express`, `ws`).

## Scoring (Vidyut currency ⚡)
Per question, ranked by the order answers reach the server: 1st correct = 1000, 2nd correct = 800, 3rd correct = 700, every later correct answer = 500, a wrong answer = 100, no answer = 0. Equal totals are ranked by more correct answers, then lower total answer time.

## Notes
- Default password is `admin123` — always set `ADMIN_PASSWORD`.
- Participants are identified by a random ID stored in their browser, so they can rejoin after a refresh and keep their answers.
- Delete `data.json` to wipe all quizzes.
