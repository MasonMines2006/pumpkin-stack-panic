---
project: Comp 227 Pumpkin Stack Game
document: Game Design
status: Early design
updated: 2026-10-13
tags:
  - game-design
  - stacks
  - queues
  - multiplayer
---

# Comp 227 Pumpkin Stack Game

## Game concept

A real-time browser game in which everyone in the class connects to the same server. Each player owns a stack of cute pixel-art pumpkins. Every pumpkin has a point value from **-5 to +5**. Players manipulate their stacks by arranging code blocks or writing simple code based on stack and queue operations.

The game begins with two modes:

- **PVP:** Every player competes for themselves.
- **PVE:** The whole class cooperates against a witch.

## Core round

1. Players join a shared classroom game through their browsers.
2. Each player receives a stack of pumpkins with values from -5 to +5.
3. Players construct and run operations that inspect, rearrange, or transfer pumpkins.
4. Operations execute over time and play pixel-art animations.
5. When the round timer reaches zero, the game calculates the final scores.

## Why sorting matters

Only the pumpkin at the top of a stack can be directly manipulated. Players therefore reorganize their stacks to expose unwanted negative pumpkins while keeping valuable positive pumpkins.

Sorting is intentionally time-consuming. Each operation takes time to execute, so a shorter or more efficient sequence gives the player a gameplay advantage. A temporary queue can act as working storage during rearrangement, making the difference between LIFO and FIFO visible through play.

Potential operations include:

```text
PEEK_TOP
POP
PUSH(pumpkin)
ENQUEUE(pumpkin)
DEQUEUE
SEND_TOP
```

The final command names and exact operation costs are still open.

## PVP mode

- Every player competes individually.
- `SEND_TOP` transfers the exposed top pumpkin to a randomly selected opponent.
- Players cannot select a target, which prevents the class from repeatedly targeting one person.
- When time expires, each player's stack values are added together.
- The player with the highest total stack value wins.

## PVE mode

- Every player belongs to one cooperative class team.
- The class plays against an evil witch.
- `SEND_TOP` transfers the exposed top pumpkin to the witch's stack.
- Player stack values are added together to produce the class score.
- Each pumpkin in the witch's stack is multiplied by the number of players.

```text
class_score = sum(all player stack values)
witch_score = sum(witch stack values) * number_of_players
```

The class wins when its score is greater than the witch's score when time expires.

This scaling makes the witch competitive with an entire class. It also makes exposing and sending negative pumpkins especially valuable. For example, with four players, a -5 pumpkin in the witch's stack contributes -20 to her final score.

The witch's actions during the round will be designed later.

## Pixel-art direction

The game should use cute, readable pixel-art animations. Possible animation beats include:

- A pumpkin bounces when pushed onto a stack.
- The top pumpkin wobbles before being popped.
- Pumpkins roll through a queue.
- A transferred pumpkin flies across the screen toward its destination.
- A discarded or destroyed pumpkin produces a small pixel-art splat or puff.
- The witch casts spells when she acts.
- Pumpkins entering the witch's stack transform into evil versions with angry eyes, horns, a purple glow, or smoke.
- PVE can briefly display the multiplier transformation, such as `-5 × 4 = -20`.

Animations should communicate the data-structure operation clearly and remain short enough that the game feels responsive.

## Confirmed decisions

- Browser-based, real-time classroom multiplayer
- Shared server that the whole class can join
- Pumpkin values range from -5 to +5
- Timed rounds
- Highest final stack value wins PVP
- PVP is free-for-all
- PVP sends the top pumpkin to a random opponent
- PVE is fully cooperative
- PVE sends the top pumpkin to the witch
- Class PVE score is the sum of all player stacks
- Witch score is her stack total multiplied by the player count
- Sorting and rearranging a stack consumes time
- The first prototype uses visual code blocks
- A later difficulty mode may let players write code themselves
- Cute pixel-art presentation and animations
- The room host has a projection-friendly TA dashboard showing every player's live board
- PVE shows a large witch health bar; pumpkins change health by value × player count

## Open design questions

- Round duration
- Starting stack size and pumpkin-value distribution
- Exact list of available operations
- Time cost of each operation
- Exact design of the later text-coding difficulty mode
- Whether submitted programs run continuously or one command at a time
- Witch behavior and difficulty scaling
- Whether reaching zero witch health should end PVE immediately or only affect the timed result
- Tie-breaking rules
- Whether disconnected players can rejoin a running round
- Room creation and joining flow
- Maximum expected class size
- Power-ups and additional modes after the initial version

## Design guardrail

Sorting must create a tactical advantage because rearranging pumpkins alone does not change their total value. Position matters because only exposed pumpkins can be transferred or otherwise acted upon.
