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

## Features
- **Host Controls**: Full control from `/#host`. Create, edit, save templates, launch live sessions, and track real-time answers.
- **Two-Stage KBC Question & Option Reveal**:
  - Host can push a question live *first* while keeping options locked on participants' screens.
  - Clicking **"Reveal Options"** plays the dramatic **KBC suspense sting** (via built-in Web Audio API synthesizer or custom `/public/kbc.mp3`), unhides the options, and begins the speed-scoring clock.
  - Host can also choose direct mode (question + options together) at any time.
- **Push Live Questions On-the-Fly**: Add new questions in the middle of an ongoing session (inserted as the next question or added to the end) with zero interruption to active players or existing scores.
- **Edit & Retake Questions**: Fix mistakes or typos in any session question. Host can update the question and optionally trigger a live retake (clearing previous answers for that question and letting participants re-answer).
- **Rearrange Questions**: Use `▲` and `▼` buttons to reorder questions in saved templates or directly inside a live/existing session without desyncing player answers.
- **Anti-Cheat Tab Switch Monitor**:
  - Automatically records when participants switch tabs, minimize browsers, or leave the app on mobile or desktop.
  - Dedicated **Anti-Cheat Leaderboard** visible **only to the host**, classifying participants by risk level (`Clean 🟢`, `Warning 🟡`, `Suspicious 🔴`). Participants never see this data.
- **Restart Past & Existing Sessions**:
  - Restart any active, paused, or finished session with the **same room code and connected players**.
  - All scores, answers, and tab switches reset to 0, and player screens automatically return to the Lobby waiting state without anyone needing to re-scan the QR code or type a new code.
  - Can be triggered directly inside a running session or from the "Past & live sessions" list on the host dashboard.
- **Manual Score Adjustments**: In the host leaderboard, use `+100` / `−100` / `±` (custom amount) / `↺` (reset) per participant. Works at any time, including after the quiz has ended; participants see the updated leaderboard instantly. Adjustments are added on top of the computed score and cleared on restart.
- **Leaderboard After the Quiz**: Participants who close the page by accident are returned to their quiz (and the final leaderboard) when they reopen the site or re-scan the QR. Anyone can also enter the code and tap **View leaderboard** for a read-only view once the quiz has ended.

## Scoring (Vidyut currency ⚡)
Per question, ranked by the order answers reach the server: 1st correct = 1000, 2nd correct = 800, 3rd correct = 700, every later correct answer = 500, a wrong answer = 100, no answer = 0. Equal totals are ranked by more correct answers, then lower total answer time.

## Notes
- Default password is `admin123` — always set `ADMIN_PASSWORD`.
- Sound effects use a built-in Web Audio API synthesizer by default. You can also place custom `kbc.mp3` or `kbc-question.mp3` inside `public/`.
- Participants are identified by a random ID stored in their browser, so they can rejoin after a refresh and keep their answers.
- Delete `data.json` to wipe all quizzes.

