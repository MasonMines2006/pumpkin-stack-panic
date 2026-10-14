import { createServer } from "node:http";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";
import { z } from "zod";
import { listLanAddresses } from "./network.js";
import { RoomManager, type Room } from "./room-manager.js";

const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PEEK_TOP") }),
  z.object({ type: z.literal("POP_TO_QUEUE") }),
  z.object({ type: z.literal("DEQUEUE_TO_STACK") }),
  z.object({ type: z.literal("SEND_TOP") }),
  z.object({ type: z.literal("POP_TOP") }),
  z.object({ type: z.literal("PEEK_QUEUE") }),
  z.object({ type: z.literal("ROTATE_QUEUE") }),
  z.object({ type: z.literal("SORT_STACK") })
]);

type ServerOptions = {
  port?: number;
  /** "127.0.0.1" = this computer only; "0.0.0.0" = reachable from classroom devices. */
  host?: string;
  /** How long a disconnected TA has to come back before their room is closed. */
  hostGraceMs?: number;
  commandDelayMs?: number;
  roundDurationMs?: number;
  stackSize?: number;
  random?: () => number;
};

// Matches Socket.IO's connection-recovery window, so a brief Wi-Fi blip never ends a class.
const DEFAULT_HOST_GRACE_MS = 2 * 60_000;
// Real game messages are a few hundred bytes; the 1 MB default only helps abusers.
const MAX_MESSAGE_BYTES = 10_000;

type Ack = (result: { ok: true; data: Room } | { ok: false; error: string }) => void;

export type RunningGameServer = {
  url: string;
  close: () => Promise<void>;
};

export async function createGameServer(
  options: ServerOptions = {}
): Promise<RunningGameServer> {
  const app = express();
  app.use(cors());
  app.get("/health", (_request, response) => response.json({ ok: true }));
  // Lets the TA lobby show a join address students can actually reach.
  app.get("/network", (_request, response) => response.json({ lanAddresses: listLanAddresses() }));

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: false },
    maxHttpBufferSize: MAX_MESSAGE_BYTES,
    connectionStateRecovery: { maxDisconnectionDuration: DEFAULT_HOST_GRACE_MS }
  });
  const manager = new RoomManager(undefined, options.random);
  const commandDelayMs = options.commandDelayMs ?? 500;
  const timers = new Set<NodeJS.Timeout>();
  const hostGraceMs = options.hostGraceMs ?? DEFAULT_HOST_GRACE_MS;

  /** Deletes a room and sends its students back to the home screen. */
  const closeRoom = (code: string, reason: string) => {
    manager.deleteRoom(code);
    io.to(code).emit("room:closed", reason);
    io.in(code).socketsLeave(code);
  };

  const isHostOf = (code: string, socketId: string): boolean => {
    try {
      return manager.getRoom(code).hostPlayerId === socketId;
    } catch {
      return false; // The room is already gone.
    }
  };

  const safely = (ack: Ack, work: () => Room): Room | undefined => {
    try {
      const room = work();
      ack({ ok: true, data: room });
      return room;
    } catch (error) {
      ack({ ok: false, error: error instanceof Error ? error.message : "Unknown error" });
      return undefined;
    }
  };

  io.on("connection", socket => {
    const moveSocketToRoom = (room: Room) => {
      const previousCode = typeof socket.data.roomCode === "string" ? socket.data.roomCode : undefined;
      if (previousCode && previousCode !== room.code && isHostOf(previousCode, socket.id)) {
        // A TA who creates a new room abandons the old one, so free it immediately.
        closeRoom(previousCode, "The TA closed this room.");
      } else if (previousCode && previousCode !== room.code) {
        try {
          const previousRoom = manager.leaveRoom(previousCode, socket.id);
          socket.leave(previousCode);
          io.to(previousCode).emit("room:state", previousRoom);
        } catch {
          socket.leave(previousCode);
        }
      }
      socket.join(room.code);
      socket.data.roomCode = room.code;
    };

    socket.on("room:create", (payload: unknown, ack: Ack) => {
      try {
        const parsed = z.object({ name: z.string() }).parse(payload);
        const room = safely(ack, () => manager.createRoom(socket.id, parsed.name));
        if (room) {
          moveSocketToRoom(room);
        }
      } catch (error) {
        ack({ ok: false, error: error instanceof Error ? error.message : "Invalid request" });
      }
    });

    socket.on("room:join", (payload: unknown, ack: Ack) => {
      try {
        const parsed = z.object({ code: z.string(), name: z.string() }).parse(payload);
        const room = safely(ack, () => manager.joinRoom(parsed.code, socket.id, parsed.name));
        if (room) {
          moveSocketToRoom(room);
          io.to(room.code).emit("room:state", room);
        }
      } catch (error) {
        ack({ ok: false, error: error instanceof Error ? error.message : "Invalid request" });
      }
    });

    socket.on("game:start", (payload: unknown, ack: Ack) => {
      try {
        const parsed = z.object({ code: z.string(), mode: z.enum(["PVP", "PVE"]) }).parse(payload);
        const room = safely(ack, () =>
          manager.startRound(
            parsed.code,
            socket.id,
            parsed.mode,
            options.roundDurationMs ?? 90_000,
            options.stackSize ?? 8
          )
        );
        if (room) {
          io.to(room.code).emit("game:state", room);
          const timer = setTimeout(() => {
            timers.delete(timer);
            try {
              const finished = manager.finishRound(room.code);
              io.to(room.code).emit("game:state", finished);
            } catch {
              // The room was closed before the round ended; nothing left to finish.
            }
          }, options.roundDurationMs ?? 90_000);
          timers.add(timer);
        }
      } catch (error) {
        ack({ ok: false, error: error instanceof Error ? error.message : "Invalid request" });
      }
    });

    socket.on("program:submit", (payload: unknown, ack: Ack) => {
      try {
        const parsed = z.object({
          code: z.string(),
          commands: z.array(commandSchema).min(1).max(20)
        }).parse(payload);
        if (socket.data.roomCode !== parsed.code.toUpperCase()) {
          throw new Error("You are not a member of that room");
        }
        // One program at a time. Without this, spamming Run starts several loops
        // that execute commands in parallel, which is both unfair and extra load.
        if (socket.data.isRunningProgram === true) {
          throw new Error("Your program is still running");
        }
        const room = manager.setPlayerProgram(parsed.code, socket.id, parsed.commands);
        socket.data.isRunningProgram = true;
        ack({ ok: true, data: room });

        void (async () => {
          try {
            for (const command of parsed.commands) {
              await new Promise<void>(resolve => {
                const timer = setTimeout(() => {
                  timers.delete(timer);
                  resolve();
                }, command.type === "SORT_STACK" ? commandDelayMs * 5 : commandDelayMs);
                timers.add(timer);
              });
              try {
                const before = manager.getRoom(parsed.code);
                const value = before.game.players[socket.id]?.stack.at(-1);
                const updated = manager.executePlayerCommand(parsed.code, socket.id, command);
                const targetId = command.type === "SEND_TOP" && updated.game.mode === "PVP"
                  ? Object.values(updated.game.players).find(player =>
                      player.id !== socket.id &&
                      player.stack.length > (before.game.players[player.id]?.stack.length ?? 0)
                    )?.id
                  : undefined;
                io.to(updated.code).emit("game:action", {
                  id: crypto.randomUUID(),
                  command: command.type,
                  actorId: socket.id,
                  ...(targetId ? { targetId } : {}),
                  ...(updated.game.mode === "PVE" && command.type === "SEND_TOP"
                    ? { target: "WITCH" as const }
                    : {}),
                  ...(value === undefined ? {} : { value })
                });
                io.to(updated.code).emit("game:state", updated);
              } catch (error) {
                socket.emit("game:error", error instanceof Error ? error.message : "Command failed");
                break;
              }
            }
          } finally {
            socket.data.isRunningProgram = false;
          }
        })();
      } catch (error) {
        ack({ ok: false, error: error instanceof Error ? error.message : "Invalid request" });
      }
    });

    socket.on("disconnect", () => {
      const roomCode = typeof socket.data.roomCode === "string" ? socket.data.roomCode : undefined;
      if (!roomCode) return;
      if (isHostOf(roomCode, socket.id)) {
        // Give the TA time to reconnect. Connection recovery keeps the same socket id,
        // so if that id is connected again when the timer fires, the TA is back.
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (!io.sockets.sockets.has(socket.id) && isHostOf(roomCode, socket.id)) {
            closeRoom(roomCode, "The TA left, so this room was closed.");
          }
        }, hostGraceMs);
        timers.add(timer);
        return;
      }
      try {
        const room = manager.leaveRoom(roomCode, socket.id);
        io.to(roomCode).emit("room:state", room);
      } catch {
        // The room may already be gone during server shutdown.
      }
    });
  });

  const port = options.port ?? Number(process.env.PORT ?? 3001);
  const host = options.host ?? process.env.HOST ?? "127.0.0.1";
  await new Promise<void>(resolve => httpServer.listen(port, host, resolve));
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("Server did not bind to a TCP port");

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      await new Promise<void>(resolve => io.close(() => resolve()));
    }
  };
}
