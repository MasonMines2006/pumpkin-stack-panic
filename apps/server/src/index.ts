import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { listLanAddresses } from "./network.js";
import { createGameServer } from "./socket-server.js";

const isProduction = process.env.NODE_ENV === "production";
// Works from both src/ (dev) and dist/ (built): either way, two folders up is apps/.
const clientDir = fileURLToPath(new URL("../../client/dist", import.meta.url));
const hasBuiltClient = existsSync(clientDir);

if (isProduction && !hasBuiltClient) {
  throw new Error(`Built client not found at ${clientDir}. Run "npm run build" first.`);
}

const server = await createGameServer({
  // In development Vite serves the page on :5173, so only serve files in production.
  ...(isProduction ? { clientDir } : {}),
  exposeNetworkInfo: !isProduction
});
console.log(`Pumpkin Stack server listening at ${server.url}`);

if (process.env.HOST === "0.0.0.0" && !isProduction) {
  for (const address of listLanAddresses()) {
    console.log(`Students join at http://${address}:5173`);
  }
}
