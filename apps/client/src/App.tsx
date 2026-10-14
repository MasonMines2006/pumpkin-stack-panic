import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  calculatePveResult,
  calculatePvpRanking,
  stackScore,
  type GameAction,
  type GameCommand,
  type GameMode,
  type GameState
} from "@pumpkin/shared";
import { BlocklyEditor } from "./BlocklyEditor.js";
import { BattleEffectsLayer } from "./BattleEffectsLayer.js";
import { createHostViewModel, getMiniCollection, type MageAvatar } from "./host-view.js";
import { parseJavaProgram, printJavaProgram } from "./java-program.js";
import { createLobbyQuestion } from "./lobby-practice.js";
import { socket } from "./socket.js";
import { useJoinUrl } from "./use-join-url.js";

type Room = { code: string; hostPlayerId: string; game: GameState };
type Ack = { ok: true; data: Room } | { ok: false; error: string };

export function App() {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [commands, setCommands] = useState<GameCommand[]>([]);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [action, setAction] = useState<GameAction | null>(null);
  // Everyone (TA included) starts muted; the ♪ / 🔇 buttons opt in.
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [editorMode, setEditorMode] = useState<"BLOCKS" | "JAVA">("BLOCKS");
  const [javaSource, setJavaSource] = useState("");
  const [programError, setProgramError] = useState<string | null>(null);
  const [programRevision, setProgramRevision] = useState(0);
  const updateCommands = useCallback((next: GameCommand[]) => {
    setCommands(next);
    setJavaSource(printJavaProgram(next));
    setProgramError(null);
  }, []);

  const updateJavaSource = (source: string) => {
    setJavaSource(source);
    const parsed = parseJavaProgram(source);
    setCommands(parsed.commands);
    setProgramError(parsed.error);
  };

  useEffect(() => {
    const sync = (next: Room) => setRoom(next);
    const showError = (message: string) => setError(message);
    // The server deleted our room (the TA left or opened a new one): go back home.
    const leaveClosedRoom = (reason: string) => {
      setRoom(null);
      setError(reason);
    };
    const actionTimers = new Set<number>();
    const showAction = (next: GameAction) => {
      setAction(next);
      const timer = window.setTimeout(() => {
        setAction(current => current?.id === next.id ? null : current);
        actionTimers.delete(timer);
      }, 1_450);
      actionTimers.add(timer);
    };
    socket.on("room:state", sync);
    socket.on("game:state", sync);
    socket.on("game:error", showError);
    socket.on("game:action", showAction);
    socket.on("room:closed", leaveClosedRoom);
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      socket.off("room:state", sync);
      socket.off("game:state", sync);
      socket.off("game:error", showError);
      socket.off("game:action", showAction);
      socket.off("room:closed", leaveClosedRoom);
      for (const actionTimer of actionTimers) window.clearTimeout(actionTimer);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (action && soundEnabled) playGameSound(action);
  }, [action, soundEnabled]);

  const send = async (event: string, payload: unknown) => {
    // Creating the audio context inside a click-triggered request satisfies
    // browser autoplay rules. Later server events can then play battle sounds.
    void getAudioContext()?.resume();
    setError("");
    const response = (await socket.timeout(2_000).emitWithAck(event, payload)) as Ack;
    if (!response.ok) throw new Error(response.error);
    setRoom(response.data);
    setRoomCode(response.data.code);
  };

  const act = async (action: () => Promise<void>) => {
    try { await action(); } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    }
  };

  const runProgram = async () => {
    if (!room) return;
    await send("program:submit", { code: room.code, commands });
    setCommands([]);
    setJavaSource("");
    setProgramError(null);
    setProgramRevision(current => current + 1);
  };

  if (!room) {
    return (
      <main className="shell home">
        <section className="card hero">
          <div className="witch-mark" aria-hidden="true"><img src="/assets/magic-pumpkin.png" alt="" /></div>
          <p className="eyebrow">A STACKS & QUEUES BATTLE</p>
          <h1>Pumpkin Stack Panic</h1>
          <p>Build block programs, move pumpkins, and protect your score before midnight.</p>
          <label>Display name<input value={name} maxLength={24} onChange={e => setName(e.target.value)} /></label>
          <div className="join-row">
            <label>Room code<input value={roomCode} maxLength={4} onChange={e => setRoomCode(e.target.value.toUpperCase())} /></label>
            <button onClick={() => void act(() => send("room:join", { name, code: roomCode }))}>Join room</button>
          </div>
          <button className="secondary" onClick={() => void act(() => send("room:create", { name }))}>Create a room</button>
          {error && <p role="alert" className="error">{error}</p>}
        </section>
      </main>
    );
  }

  const me = room.game.players[socket.id ?? ""];
  const isHost = room.hostPlayerId === socket.id;

  if (room.game.phase === "LOBBY") {
    return <Lobby room={room} isHost={isHost} error={error} soundEnabled={soundEnabled} onToggleSound={() => setSoundEnabled(value => !value)} onStart={mode => void act(() => send("game:start", { code: room.code, mode }))} />;
  }

  if (room.game.phase === "RESULTS") return <Results room={room} />;
  const seconds = Math.max(0, Math.ceil(((room.game.roundEndsAt ?? now) - now) / 1000));

  if (isHost) {
    return <HostDashboard room={room} seconds={seconds} action={action} soundEnabled={soundEnabled} onToggleSound={() => setSoundEnabled(value => !value)} />;
  }

  return (
    <main className="game-shell">
      <header><span className="logo">🎃 Pumpkin Stack Panic</span><strong>{seconds}s</strong><span className="header-actions"><button className="view-toggle" onClick={() => setSoundEnabled(value => !value)}>{soundEnabled ? "🔊" : "🔇"}</button><span>{room.game.mode}</span></span></header>
      <section className="game-grid">
        <aside className="card stack-panel"><h2>Your stack</h2><p>Score: <strong>{stackScore(me?.stack ?? [])}</strong></p><Pumpkins values={me?.stack ?? []} /></aside>
        <section className="card code-panel">
          <div className="code-panel-heading">
            <div><p className="eyebrow">BUILD YOUR PROGRAM</p><p>{commands.length}/20 commands</p></div>
            <div className="editor-toggle" role="group" aria-label="Program editor mode">
              <button className={editorMode === "BLOCKS" ? "active" : ""} onClick={() => setEditorMode("BLOCKS")}>Blocks</button>
              <button className={editorMode === "JAVA" ? "active" : ""} onClick={() => setEditorMode("JAVA")}>Java</button>
            </div>
          </div>
          {editorMode === "BLOCKS"
            ? <BlocklyEditor key={programRevision} initialCommands={commands} onChange={updateCommands} />
            : <JavaProgramEditor source={javaSource} error={programError} onChange={updateJavaSource} />}
          <button disabled={commands.length === 0 || programError !== null} onClick={() => void act(runProgram)}>▶ Run program</button>
        </section>
        <aside className="card queue-panel"><h2>Queue</h2><div className="queue">{(me?.queue ?? []).map((value, index) => <Pumpkin key={index} value={value} />)}</div>{room.game.mode === "PVE" && <><BossHealth health={room.game.witchHealth} compact action={action} /><h2>Evil pumpkins × {Object.keys(room.game.players).length}</h2><Pumpkins values={room.game.witchStack} evil /></>}</aside>
      </section>
      <ActionAnimation action={action} room={room} />
      {error && <p role="alert" className="error floating">{error}</p>}
    </main>
  );
}

function Lobby({ room, isHost, error, soundEnabled, onToggleSound, onStart }: { room: Room; isHost: boolean; error: string; soundEnabled: boolean; onToggleSound: () => void; onStart: (mode: GameMode) => void }) {
  useLobbyMusic(soundEnabled);
  // Drop "http://" so the projector shows something short enough to type, e.g. 192.168.1.42:5173.
  const joinAddress = useJoinUrl(isHost).replace(/^https?:\/\//, "").toUpperCase();
  const players = createHostViewModel(room.game).players;
  return <main className={`lobby-shell ${isHost ? "host-lobby" : "student-lobby"}`}>
    <LobbyMagic />
    <header className="lobby-header"><span className="logo">🎃 PUMPKIN STACK PANIC</span><span className="lobby-controls"><button className="sound-toggle" onClick={onToggleSound} aria-label={soundEnabled ? "Mute lobby music" : "Play lobby music"}>{soundEnabled ? "♫" : "♪̸"}</button><span className="lobby-status"><i /> Lobby open</span></span></header>
    {isHost
      ? <section className="host-lobby-layout">
          <div className="join-panel">
            <p className="eyebrow">JOIN AT {joinAddress}</p>
            <span className="join-label">GAME CODE</span>
            <strong className="giant-room-code">{room.code}</strong>
            <p className="join-instruction">Enter the code, meet your magical animal, and warm up while everyone joins.</p>
            <div className="mode-buttons">
              <button disabled={players.length === 0} onClick={() => onStart("PVP")}>⚔ Start PVP</button>
              <button disabled={players.length === 0} className="witch-button" onClick={() => onStart("PVE")}>🧙 Start PVE</button>
            </div>
            {players.length === 0 && <small className="start-hint">Waiting for the first student…</small>}
          </div>
          <div className="joined-panel">
            <div className="joined-heading"><div><p className="eyebrow">MAGICAL ROSTER</p><h1>Ready to cast?</h1></div><strong>{players.length}<small>JOINED</small></strong></div>
            <div className="lobby-player-grid">{players.map((player, index) => <div className="lobby-player" style={{ animationDelay: `${index * 70}ms` }} key={player.id}><MageAvatarView avatar={player.avatar} /><span>{player.name}</span><small>{player.avatar.name} mage</small></div>)}</div>
          </div>
        </section>
      : <StudentWarmup room={room} />}
    {error && <p role="alert" className="error lobby-error">{error}</p>}
  </main>;
}

function LobbyMagic() {
  return <div className="lobby-magic" aria-hidden="true">
    {Array.from({ length: 12 }, (_, index) => <img key={index} src="/assets/magic-pumpkin.png" alt="" style={{ left: `${3 + index * 8.3}%`, animationDelay: `${-(index % 6) * 1.1}s`, animationDuration: `${7 + index % 4}s` } as CSSProperties} />)}
  </div>;
}

function StudentWarmup({ room }: { room: Room }) {
  const [question, setQuestion] = useState(() => createLobbyQuestion());
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);
  const correct = selected === question.correctIndex;
  const answer = (index: number) => {
    if (selected !== null) return;
    setSelected(index);
    if (index === question.correctIndex) setScore(current => current + 1);
  };
  const next = () => {
    setQuestion(createLobbyQuestion());
    setSelected(null);
    setAnswered(current => current + 1);
  };

  return <section className="student-warmup-layout">
    <aside className="waiting-card">
      <p className="eyebrow">YOU'RE IN!</p>
      <h1>Practice your magic</h1>
      <p>The TA will start soon. Try as many warm-up questions as you like.</p>
      <div className="student-room-code"><span>ROOM</span><strong>{room.code}</strong></div>
      <div className="warmup-score"><strong>{score}</strong><span>correct</span></div>
      <div className="waiting-pulse"><i /><span>Waiting for the host</span></div>
    </aside>
    <section className={`practice-card ${selected !== null ? correct ? "answered-correct" : "answered-wrong" : ""}`}>
      <div className="practice-heading"><span>{question.structure} CHECK</span><strong>RANDOM #{answered + 1}</strong></div>
      <div className="practice-demo">
        <div className={`practice-values ${question.structure.toLowerCase()}`}>{question.values.map((value, index) => <Pumpkin key={index} value={value} mini />)}</div>
        <code>{question.operation}</code>
      </div>
      <h2>{question.prompt}</h2>
      <div className="answer-grid">{question.options.map((option, index) => <button className={selected === null ? "" : index === question.correctIndex ? "correct" : index === selected ? "wrong" : "dimmed"} disabled={selected !== null} onClick={() => answer(index)} key={option}><span>{["▲", "◆", "●", "■"][index]}</span>{option}</button>)}</div>
      {selected !== null && <div className="answer-feedback" role="status"><strong>{correct ? "Correct spell!" : "Almost!"}</strong><p>{question.explanation}</p><button onClick={next}>Next question →</button></div>}
    </section>
  </section>;
}

function Pumpkin({ value, evil = false, mini = false }: { value: number; evil?: boolean; mini?: boolean }) {
  return <div className={`pumpkin ${evil ? "evil" : ""} ${value < 0 ? "negative" : "positive"} ${mini ? "mini" : ""}`} title={`${value} points`}><img src="/assets/magic-pumpkin.png" alt="" /><strong>{value > 0 ? `+${value}` : value}</strong></div>;
}

function MageAvatarView({ avatar }: { avatar: MageAvatar }) {
  return <span className="mage-avatar" role="img" aria-label={`${avatar.name} mage`} style={{ backgroundPositionX: avatar.spritePosition }} />;
}

function Pumpkins({ values, evil = false, mini = false }: { values: number[]; evil?: boolean; mini?: boolean }) {
  return <div className={`stack ${mini ? "mini-stack" : ""}`}>{values.map((value, index) => <Pumpkin key={index} value={value} evil={evil} mini={mini} />)}</div>;
}

function JavaProgramEditor({ source, error, onChange }: { source: string; error: string | null; onChange: (source: string) => void }) {
  return <div className="java-program-editor">
    <div className="java-hint"><strong>Supported Java-style statements</strong><code>stack.peek();</code><code>stack.pop();</code><code>queue.peek();</code><code>queue.add(stack.pop());</code><code>stack.push(queue.remove());</code><code>queue.add(queue.remove());</code><code>opponent.add(stack.pop());</code><code>Collections.sort(stack); // slow</code></div>
    <textarea aria-label="Java-like pumpkin program" value={source} spellCheck={false} placeholder={"queue.add(stack.pop());\nopponent.add(stack.pop());"} onChange={event => onChange(event.target.value)} />
    {error && <p role="alert" className="program-error">{error}</p>}
  </div>;
}

function MiniPumpkins({ values, kind }: { values: number[]; kind: "STACK" | "QUEUE" }) {
  const preview = getMiniCollection(values, kind);
  return <div className={`mini-collection mini-${kind.toLowerCase()}-collection`}>
    <div className={kind === "STACK" ? "stack mini-stack" : "mini-queue"}>
      {preview.values.map((value, index) => <Pumpkin key={index} value={value} mini />)}
    </div>
    {preview.hiddenCount > 0 && <span className="more-pumpkins">+{preview.hiddenCount} more</span>}
  </div>;
}

function Results({ room }: { room: Room }) {
  const result = useMemo(() => room.game.mode === "PVE" ? calculatePveResult(room.game) : calculatePvpRanking(room.game), [room]);
  return <main className="shell"><section className="card results"><p className="eyebrow">MIDNIGHT!</p><h1>{Array.isArray(result) ? `${result[0]?.name ?? "Nobody"} wins!` : result.classWon ? "The class defeated the witch!" : "The witch wins!"}</h1>{Array.isArray(result) ? result.map((entry, index) => <p key={entry.playerId}>{index + 1}. {entry.name} — {entry.score}</p>) : <p>Class {result.classScore} · Witch {result.witchScore}</p>}<button onClick={() => window.location.reload()}>Play again</button></section></main>;
}

function HostDashboard({ room, seconds, action, soundEnabled, onToggleSound }: {
  room: Room;
  seconds: number;
  action: GameAction | null;
  soundEnabled: boolean;
  onToggleSound: () => void;
}) {
  const view = useMemo(() => createHostViewModel(room.game), [room.game]);
  return (
    <main className={`host-shell ${action?.target === "WITCH" ? "battle-impact" : ""}`}>
      <header className="host-header">
        <span className="logo"><small>{room.game.mode === "PVE" ? "CO-OP BOSS BATTLE" : "MAGE FREE-FOR-ALL"}</small>PUMPKIN STACK PANIC</span>
        <div className="timer-rune"><span>TIME</span><strong className="projection-timer">{seconds}</strong></div>
        <span className="header-actions"><span className="room-rune">ROOM <strong>{room.code}</strong></span><button className="sound-toggle" onClick={onToggleSound} aria-label={soundEnabled ? "Mute sound" : "Enable sound"}>{soundEnabled ? "🔊" : "🔇"}</button></span>
      </header>
      <section className="battle-arena">
        <div className="arena-mist" />
        {view.boss ? <div data-battle-target="witch" className={`boss-stage ${action?.target === "WITCH" ? "is-hit" : ""}`}>
          <div className="boss-nameplate"><span>FINAL BOSS</span><strong>Headmistress Corva</strong></div>
          <img className="witch-sprite" src="/assets/raven-witch.png" alt="Headmistress Corva, the raven witch" />
          <BossHealth health={view.boss.health} multiplier={view.boss.multiplier} action={action} />
        </div> : <div className="duel-title"><span>EVERY MAGE FOR THEMSELVES</span><strong>Highest pumpkin stack wins!</strong></div>}
        <section className="player-wall" aria-label="Live player game boards">
        {view.players.map(player => (
          <article data-player-id={player.id} className={`player-board ${player.connected ? "" : "offline"} ${action?.actorId === player.id ? "is-casting" : ""} ${action?.targetId === player.id ? "is-targeted" : ""}`} key={player.id}>
            <div className="mage-platform"><MageAvatarView avatar={player.avatar} /><span className="casting-ring" /></div>
            <div className="player-hud">
              <div className="player-board-header"><h2>{player.name}</h2><strong>{player.score}<small>PTS</small></strong></div>
              <div className="mini-board">
                <div><span className="mini-label">STACK</span><MiniPumpkins values={player.stack} kind="STACK" /></div>
                <div><span className="mini-label">QUEUE</span><MiniPumpkins values={player.queue} kind="QUEUE" /></div>
              </div>
              <div className="program-progress"><span>CASTING PROGRAM</span><strong>{player.commandProgress}</strong></div>
            </div>
          </article>
        ))}
        </section>
        <BattleEffectsLayer action={action} />
      </section>
      <ActionAnimation action={action} room={room} showProjectile={false} />
    </main>
  );
}

function BossHealth({ health, multiplier, compact = false, action }: {
  health: number;
  multiplier?: number;
  compact?: boolean;
  action: GameAction | null;
}) {
  const hit = action?.target === "WITCH" && (action.value ?? 0) < 0;
  return (
    <section className={`boss-health ${compact ? "compact" : ""} ${hit ? "boss-hit" : ""}`} aria-label="Witch boss health">
      <div className="boss-title"><div><span>BOSS HEALTH</span><strong>{health} / 100 HP</strong></div>{multiplier && <em>×{multiplier} CLASS POWER</em>}</div>
      <div className="health-track" role="progressbar" aria-label="Witch health" aria-valuemin={0} aria-valuemax={100} aria-valuenow={health}>
        <div className="health-fill" style={{ transform: `scaleX(${health / 100})` }} />
      </div>
    </section>
  );
}

function ActionAnimation({ action, room, showProjectile = true }: { action: GameAction | null; room: Room; showProjectile?: boolean }) {
  if (!action) return null;
  const actor = room.game.players[action.actorId]?.name ?? "A player";
  const target = action.target === "WITCH"
    ? "the witch"
    : action.targetId ? room.game.players[action.targetId]?.name ?? "an opponent" : "their queue";
  const labels: Record<GameAction["command"], string> = {
    PEEK_TOP: `${actor} peeked at the top pumpkin`,
    POP_TO_QUEUE: `${actor} moved a pumpkin into the queue`,
    DEQUEUE_TO_STACK: `${actor} returned a pumpkin to the stack`,
    SEND_TOP: `${actor} sent ${action.value ?? "a pumpkin"} to ${target}`,
    POP_TOP: `${actor} discarded the top pumpkin`,
    PEEK_QUEUE: `${actor} inspected the queue front`,
    ROTATE_QUEUE: `${actor} rotated the queue`,
    SORT_STACK: `${actor} spent extra time sorting the stack`
  };
  const damage = action.target === "WITCH" && action.value !== undefined
    ? -(action.value * Object.keys(room.game.players).length)
    : null;
  return <div key={action.id} className={`action-animation action-${action.command.toLowerCase()} ${action.target === "WITCH" ? "witch-target" : ""} ${showProjectile ? "" : "no-projectile"}`} role="status">
    {showProjectile && <img aria-hidden="true" src="/assets/magic-pumpkin.png" />}
    {damage !== null && <b className={damage > 0 ? "damage-number" : "heal-number"}>{damage > 0 ? `-${damage}` : `+${Math.abs(damage)}`} HP</b>}
    <strong>{labels[action.command]}</strong>
  </div>;
}

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  sharedAudioContext ??= new AudioContext();
  return sharedAudioContext;
}

function useLobbyMusic(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const context = getAudioContext();
    if (!context) return;
    void context.resume();
    const activeOscillators = new Set<OscillatorNode>();
    const melody = [261.63, 311.13, 392, 466.16, 392, 311.13, 293.66, 392];

    const playPhrase = () => {
      const phraseStart = context.currentTime + .04;
      melody.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = phraseStart + index * .36;
        oscillator.type = index % 4 === 3 ? "sine" : "triangle";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(index % 4 === 3 ? .032 : .021, start + .045);
        gain.gain.exponentialRampToValueAtTime(.0001, start + .31);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + .34);
        activeOscillators.add(oscillator);
        oscillator.onended = () => activeOscillators.delete(oscillator);
      });
    };

    playPhrase();
    const interval = window.setInterval(playPhrase, 3_600);
    return () => {
      window.clearInterval(interval);
      for (const oscillator of activeOscillators) {
        try { oscillator.stop(); } catch { /* It may already have finished. */ }
      }
      activeOscillators.clear();
    };
  }, [enabled]);
}

function playGameSound(action: GameAction) {
  const context = getAudioContext();
  if (!context || context.state !== "running") return;
  const now = context.currentTime;
  const notes = action.command === "SEND_TOP" ? [180, 360, 110] : [420, 620];

  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index === notes.length - 1 ? "sawtooth" : "triangle";
    oscillator.frequency.setValueAtTime(frequency, now + index * 0.06);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(60, frequency / 2), now + 0.28 + index * 0.06);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02 + index * 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32 + index * 0.06);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + index * 0.06);
    oscillator.stop(now + 0.36 + index * 0.06);
  });
}
