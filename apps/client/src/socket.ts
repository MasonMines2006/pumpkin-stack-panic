import { io } from "socket.io-client";
import { resolveServerUrl } from "./connection.js";

export const serverUrl = resolveServerUrl(
  window.location,
  import.meta.env.VITE_SERVER_URL,
  import.meta.env.DEV
);

export const socket = io(serverUrl, {
  autoConnect: true
});
