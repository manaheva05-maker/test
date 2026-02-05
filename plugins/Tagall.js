import { Module } from "../lib/plugins.js";
import { getTheme } from "../Themes/themes.js";
import axios from "axios";

const theme = getTheme();
const BOT_IMAGE = "https://i.postimg.cc/XvsZgKCb/IMG-20250731-WA0527.jpg";

async function getBotImageBuffer() {
  try {
    const res = await axios.get(BOT_IMAGE, {
      responseType: "arraybuffer",
      timeout: 20000,
    });
    return Buffer.from(res.data);
  } catch (e) {
    console.error("[tagall] getBotImageBuffer error:", e?.message || e);
    return null;
  }
}

Module({
  command: "tagall",
  package: "group",
  description: "Tag all group members with custom style",
})(async (m, text) => {
  if (!m.isGroup) return m.send(theme.isGroup);
  await m.loadGroupInfo();
  try {
    const conn = m.conn;
    const from = m.from;
    const groupMetadata = await conn.groupMetadata(from);
    const participants = groupMetadata.participants;
    const groupName = groupMetadata.subject || "Unknown Group";
    
    // Filter admins and non-admins
    const admins = participants.filter(
      (p) => p.admin === "admin" || p.admin === "superadmin"
    );
    
    const totalMembers = participants ? participants.length : 0;
    const adminCount = admins.length;
    
    if (totalMembers === 0)
      return m.sendreply("❌ No members found in this group.");
    
    const msgText = text?.trim() || "MINI INCONNU XD TAGALL";

    // Build the text
    let tagText = `╭───────────────⭓\n`;
    tagText += `│ group : ${groupName}\n`;
    tagText += `│ admin : ${adminCount}\n`;
    tagText += `│ membres : ${totalMembers}\n`;
    tagText += `│ ᴠᴇʀꜱɪᴏɴ : 2.0.0\n`;
    tagText += `╰───────────────⭓\n`;
    tagText += `> ${msgText}\n\n`;

    // Add mentions for all participants
    for (const p of participants) {
      tagText += `@${p.id.split("@")[0]}\n`;
    }

    const mentions = participants.map((p) => p.id);
    const botImageBuffer = await getBotImageBuffer();
    
    // Send message with image
    const messageOptions = {
      image: botImageBuffer,
      caption: tagText,
      mentions,
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: "120363403408693274@newsletter",
          newsletterName: "𝙼𝙸𝙽𝙸 𝙸𝙽𝙲𝙾𝙽𝙽𝚄 𝚇𝙳",
          serverMessageId: 6,
        },
      }
    };
    
    await conn.sendMessage(from, messageOptions, { quoted: m.raw });
  } catch (err) {
    console.error("tagall error:", err);
    m.sendreply("❌ An error occurred while tagging members.");
  }
});

Module({
  command: "admin",
  package: "group",
  description: "Tag all group admins",
})(async (m, text) => {
  await m.loadGroupInfo(m.from);
  if (!m.isGroup) return m.send(theme.isGroup);

  try {
    const conn = m.conn;
    const from = m.from;
    const groupMetadata = await conn.groupMetadata(from);
    const participants = groupMetadata.participants;
    const groupName = groupMetadata.subject || "Unknown Group";

    // Filter only admins and super admins
    const admins = participants.filter(
      (p) => p.admin === "admin" || p.admin === "superadmin"
    );
    const totalAdmins = admins.length;

    if (totalAdmins === 0) {
      return await m.sendReply("❌ No admins found in this group.");
    }

    const msgText = text?.trim() || "ATTENTION ADMINS";

    // Build the text with image
    let tagText = `╭───────────────⭓\n`;
    tagText += `│ group : ${groupName}\n`;
    tagText += `│ admin : ${totalAdmins}\n`;
    tagText += `│ membres : ${participants.length}\n`;
    tagText += `│ ᴠᴇʀꜱɪᴏɴ : 2.0.0\n`;
    tagText += `╰───────────────⭓\n`;
    tagText += `> ${msgText}\n\n`;

    // Add admin mentions
    for (const admin of admins) {
      tagText += `@${admin.id.split("@")[0]}\n`;
    }

    const mentions = admins.map((a) => a.id);
    const botImageBuffer = await getBotImageBuffer();
    
    // Send message with image
    const messageOptions = {
      image: botImageBuffer,
      caption: tagText,
      mentions,
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: "120363403408693274@newsletter",
          newsletterName: "𝙼𝙸𝙽𝙸 𝙸𝙽𝙲𝙾𝙽𝙽𝚄 𝚇𝙳",
          serverMessageId: 6,
        },
      }
    };

    await conn.sendMessage(from, messageOptions, { quoted: m.raw });
  } catch (err) {
    console.error("admin tag error:", err);
    await m.sendReply("❌ An error occurred while tagging admins.");
  }
});

Module({
  command: "rtag",
  package: "group",
  description: "Tag random members",
})(async (m, text) => {
  if (!m.isGroup) return m.send(theme.isGroup);

  await m.loadGroupInfo();

  try {
    const count = parseInt(text) || 5;
    const participants = m.groupParticipants;

    // Shuffle and pick random members
    const shuffled = participants.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, Math.min(count, participants.length));

    let tagText = `╭───────────────⭓\n`;
    tagText += `│ group : ${m.groupName || "Unknown"}\n`;
    tagText += `│ selected : ${selected.length}\n`;
    tagText += `│ total : ${participants.length}\n`;
    tagText += `│ ᴠᴇʀꜱɪᴏɴ : 2.0.0\n`;
    tagText += `╰───────────────⭓\n`;
    tagText += `> RANDOM TAG\n\n`;

    const mentions = [];
    for (const p of selected) {
      tagText += `@${p.id.split("@")[0]}\n`;
      mentions.push(p.id);
    }

    const botImageBuffer = await getBotImageBuffer();
    
    await m.send({ 
      image: botImageBuffer, 
      caption: tagText, 
      mentions 
    });
  } catch (err) {
    await m.reply("❌ Error: " + err.message);
  }
});

Module({
  command: "hidetag",
  package: "group",
  description: "Tag all without showing names",
})(async (m, text) => {
  if (!m.isGroup) return m.send(theme.isGroup);

  await m.loadGroupInfo();

  if (!m.isAdmin && !m.isFromMe) return m.send(theme.isAdmin);

  try {
    const message = text || "📢 Everyone has been tagged!";
    const mentions = m.groupParticipants.map((p) => p.id);
    
    const botImageBuffer = await getBotImageBuffer();
    
    await m.send({ 
      image: botImageBuffer, 
      caption: message, 
      mentions 
    });
    await m.react("👻");
  } catch (err) {
    await m.reply("❌ Error: " + err.message);
  }
});
