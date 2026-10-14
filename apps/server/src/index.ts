import { listLanAddresses } from "./network.js";
import { createGameServer } from "./socket-server.js";

const server = await createGameServer();
console.log(`Pumpkin Stack server listening at ${server.url}`);

if (process.env.HOST === "0.0.0.0") {
  for (const address of listLanAddresses()) {
    console.log(`Students join at http://${address}:5173`);
  }
}
