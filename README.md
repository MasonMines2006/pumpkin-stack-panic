# Pumpkin Stack Panic

A real-time classroom game for practicing stacks and queues. Players can build Blockly programs or write a constrained Java-like program that manipulates a LIFO stack and FIFO queue, then send the exposed top pumpkin to an opponent or a cooperative PVE witch.

## Run locally

Requirements: Node.js 22+ and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in two browser tabs. Create a room for the TA in the first tab, join its four-letter code as a student in the second, and start PVP or PVE from the host tab. The TA is a spectator and does not receive pumpkins or count toward scoring.

In development the client talks to port `3001` on whatever host served the page. In production one server serves both the page and the game, so the client uses its own origin. Set `VITE_SERVER_URL` only if the server lives somewhere else.

## Classroom on the same Wi-Fi (backup option)

```bash
npm run dev:lan
```

Students open the `Students join at …` address the server prints. Campus networks often block device-to-device traffic, so prefer the hosted version below.

## Deploy (Render)

`render.yaml` describes a single free Render web service: `npm ci --include=dev && npm run build`, then `npm start`. Express serves `apps/client/dist` and Socket.IO from one URL.

- Free instances sleep after ~15 idle minutes; open the site a few minutes before class so it is awake.
- Rooms live in memory: a redeploy or restart ends every room, so do not push during class.
- Keep exactly one instance; rooms are not shared between servers.

Run the production build locally with `npm run build && npm start` (serves on port 3001).

## Commands

```bash
npm test
npm run test:coverage
npm run typecheck
npm run build
```

## Workspace

- `apps/client` — React, Vite, Blockly, animations, and game screens
- `apps/server` — Express, Socket.IO, rooms, timers, and command execution
- `packages/shared` — shared TypeScript game rules, scoring, and event data

The server is authoritative: clients submit command data and never choose scores, pumpkin values, or PVP targets.

The room creator receives a dedicated **TA battle view** during a round. It arranges every player in a compact, Tetris-style grid as a magical-animal student with a live stack, queue, score, and command progress display. Long collections show the five relevant entries plus a hidden-count badge, so pumpkins stay inside their cards. PixiJS draws a staged cast, curved projectile trail, and impact burst from the casting player to the selected opponent or PVE boss. In PVE, the class fights Headmistress Corva in an animated pixel-art arena. Negative pumpkins damage the witch and positive pumpkins heal her by `pumpkin value × player count`, clamped between 0 and 100 HP.

Students can switch between **Blocks** and **Java** while preserving the current command sequence. Java mode accepts a safe teaching subset: `peek`, `pop`, moving values through `push`/`add`/`remove`, rotating a queue, attacking an opponent, and `Collections.sort(stack)`. Sorting takes five times as long as a normal command, making its convenience a visible game tradeoff.

The waiting room uses a projector-first layout with a large room code, an animated magical roster, drifting pumpkin effects, and an original synthesized music loop controlled from the lobby header. Student music is opt-in to avoid a classroom full of overlapping audio. Student screens generate unlimited randomized Stack/Queue warm-ups from ten operation patterns, with fresh values, answer choices, immediate explanations, and a local score. Warm-up answers do not affect the match or prevent the TA from starting it.

Submitted programs clear from both editor modes as soon as the server accepts them, making the next program visibly start from a blank slate. Each browser is kept in exactly one Socket.IO room, and an integration test verifies that simultaneous classroom lobbies do not receive one another's state or attack events.

## Prototype limitations

Rooms live in memory and disappear when the server restarts. The original pixel-art assets in `apps/client/public/assets` are prototype artwork. PixiJS handles routed battle effects, while the magical-animal artwork remains single-frame with transform-based cast and hit motion; full frame-by-frame animation requires sprite sheets. Accounts, permanent match history, witch counterattacks, and background music are deferred.
