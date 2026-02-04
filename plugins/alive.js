import os from "os";
import { Module } from "../lib/plugins.js";

Module({
  command: "alive",
  package: "general",
  description: "Check bot status",
})(async (message) => {
  try {
    const time = new Date().toLocaleTimeString("en-GB", {
      hour12: false,
    });

    const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);

    const text = `
🤖 *BOT STATUS*

✅ Status : *Alive*
⏰ Time   : ${time}
💾 RAM    : ${ram} MB
⏱ Uptime : ${h}h ${m}m ${s}s

✨ Bot is running smoothly
`.trim();

    await message.conn.sendMessage(message.from, {
      text,
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: "120363403408693274@newsletter",
          newsletterName: "𝙼𝙸𝙽𝙸 𝙸𝙽𝙲𝙾𝙽𝙽𝚄 𝚇𝙳",
          serverMessageId: 6,
        },
      },
    });
  } catch (e) {
    await message.conn.sendMessage(message.from, {
      text: "❌ Error while checking status",
    });
  }
});
