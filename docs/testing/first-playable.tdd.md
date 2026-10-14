# First Playable TDD Evidence

## Source

The user journeys were derived from the game-design interview and the prototype architecture saved in Obsidian.

## User journeys

- As a player, I can manipulate a pumpkin stack with stack and queue commands.
- As a PVP player, I can send the top pumpkin to a random connected opponent.
- As a PVE player, I can send the top pumpkin to the witch and receive the agreed multiplied scoring result.
- As a host, I can create a room and start a timed PVP or PVE round.
- As another player, I can join the room and receive the same authoritative state.
- As a TA host, I can project a live grid of every player's game board.
- As a class in PVE, I can see negative pumpkins damage the witch's large health bar.
- As a player, I see a short, reduced-motion-safe animation when commands change game state.

## RED and GREEN evidence

| Behavior | RED evidence | GREEN evidence |
| --- | --- | --- |
| Game engine and room manager | `npm test` failed because `game.js` and `room-manager.js` did not exist | 14 unit tests passed after the minimal implementations |
| Two-player synchronization | Socket test failed because `socket-server.js` did not exist | Integration test transferred a pumpkin and both clients received the state |
| Malformed request handling | Wrong-type room name timed out with an uncaught `ZodError` | Server now returns a normal error acknowledgement |
| Host view and boss health | Host view module was missing and PVE sends left health unchanged | Host view model, program progress, action events, and multiplied health changes pass unit and integration tests |

## Final verification

- `npm run test:coverage`: 25 tests passed with 97.05% statements, 82.30% branches, 100% functions, and 97.05% lines.
- `npm run typecheck`: passed for client, server, and shared packages.
- `npm run build`: production build passed.
- Runtime checks: server `/health` returned `{ "ok": true }`; Vite served the game HTML.
- `npm audit --omit=dev`: zero production vulnerabilities.

The final validation reruns these commands after the review fixes. UI browser automation is a known gap; socket integration covers the critical two-client state flow.
