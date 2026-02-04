import { Module } from "../lib/plugins.js";

Module({
  command: "ping",
  package: "misc",
  description: "Bot latency",
})(async (message) => {
  const start = Date.now();

  const latency = Date.now() - start;

  await message.conn.sendMessage(message.from, {
    text: `🏓 Pong : *${latency} ms*`,
  });
});
