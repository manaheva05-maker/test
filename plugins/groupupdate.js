// plugins/groupupdate.js
import { Module } from "../lib/plugins.js";
import { db } from "../lib/client.js";
import axios from "axios";
import { jidNormalizedUser } from "@whiskeysockets/baileys";

const DEFAULT_GOODBYE = `╭─  *GOODBYE*
│ • user : &mention
│ • group : &name
│ • members : &size
│ • admin : &admins
│ • date : &date
╰───────────────⭓

╭───────────────⭓ 
│ use : &mention
│ bot : inconnu xd
│ dev : inconnu boy
│ ᴠᴇʀꜱɪᴏɴ : 2.0.0
╰───────────────⭓`;

const DEFAULT_WELCOME = `╭─  *WELCOME*
│ • user : &mention
│ • group : &name
│ • members : &size
│ • admin : &admins
│ • date : &date
╰───────────────⭓

╭───────────────⭓ 
│ use : &mention
│ bot : inconnu xd
│ dev : inconnu boy 
│ ᴠᴇʀꜱɪᴏɴ : 2.0.0
╰───────────────⭓`;

// URL de l'image par défaut
const DEFAULT_PROFILE_IMAGE = "https://i.postimg.cc/XvsZgKCb/IMG-20250731-WA0527.jpg";

/* ---------------- helpers ---------------- */
function toBool(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === "string")
    return ["true", "1", "yes", "on"].includes(v.toLowerCase());
  return Boolean(v);
}

function formatDate() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function buildText(template = "", replacements = {}) {
  let text = template || "";
  text = text.replace(/&mention/g, replacements.mentionText || "");
  text = text.replace(/&name/g, replacements.name || "");
  text = text.replace(/&size/g, String(replacements.size ?? ""));
  text = text.replace(/&admins/g, String(replacements.adminCount ?? "0"));
  text = text.replace(/&date/g, replacements.date || formatDate());
  return text;
}

async function getAdminCount(conn, groupJid) {
  try {
    const metadata = await conn.groupMetadata(groupJid);
    if (metadata && Array.isArray(metadata.participants)) {
      return metadata.participants.filter(p => 
        p.admin === "admin" || p.admin === "superadmin"
      ).length;
    }
  } catch (e) {
    console.error("[groupupdate] getAdminCount error:", e?.message || e);
  }
  return 0;
}

async function fetchProfileBuffer(conn, jid) {
  try {
    const getUrl =
      typeof conn.profilePictureUrl === "function"
        ? () => conn.profilePictureUrl(jid, "image").catch(() => null)
        : () => Promise.resolve(null);
    const url = await getUrl();
    if (!url) return null;
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 20000,
    });
    return Buffer.from(res.data);
  } catch (e) {
    console.error("[groupupdate] fetchProfileBuffer error:", e?.message || e);
    return null;
  }
}

async function getDefaultImageBuffer() {
  try {
    const res = await axios.get(DEFAULT_PROFILE_IMAGE, {
      responseType: "arraybuffer",
      timeout: 20000,
    });
    return Buffer.from(res.data);
  } catch (e) {
    console.error("[groupupdate] getDefaultImageBuffer error:", e?.message || e);
    return null;
  }
}

async function getParticipantProfile(conn, participantJid) {
  try {
    // Essayer d'abord de récupérer la photo de profil du participant
    const profileBuffer = await fetchProfileBuffer(conn, participantJid);
    if (profileBuffer) {
      return profileBuffer;
    }
    
    // Si pas de photo de profil, utiliser l'image par défaut
    return await getDefaultImageBuffer();
  } catch (e) {
    console.error("[groupupdate] getParticipantProfile error:", e?.message || e);
    return await getDefaultImageBuffer();
  }
}

async function sendWelcomeMsg(conn, groupJid, text, mentions = [], imgBuffer = null) {
  try {
    const messageOptions = {
      text,
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

    if (imgBuffer) {
      messageOptions.image = imgBuffer;
      messageOptions.caption = text;
    }

    await conn.sendMessage(groupJid, messageOptions);
  } catch (err) {
    console.error("[groupupdate] sendWelcomeMsg primary error:", err?.message || err);
    // fallback without newsletter context
    try {
      if (imgBuffer) {
        await conn.sendMessage(groupJid, { 
          image: imgBuffer, 
          caption: text,
          mentions 
        });
      } else {
        await conn.sendMessage(groupJid, { 
          text, 
          mentions 
        });
      }
    } catch (e) {
      console.error("[groupupdate] sendWelcomeMsg fallback error:", e?.message || e);
    }
  }
}

/* ---------------- COMMANDS (group-level on/off only) ---------------- */
Module({
  command: "welcome",
  package: "group",
  description: "Turn per-group welcome ON or OFF (must be used inside the group).",
})(async (message, match) => {
  const groupJid =
    message.from ||
    message.chat ||
    message.key?.remoteJid ||
    (message.isGroup ? message.isGroup : null);
  if (!groupJid || !groupJid.includes("@g.us")) {
    return await message.send?.("❌ Use this command inside the group to toggle welcome messages.");
  }

  const raw = (match || "").trim().toLowerCase();
  if (!raw) {
    const botNumber = (message.conn?.user?.id && String(message.conn.user.id).split(":")[0]) || "bot";
    const key = `group:${groupJid}:welcome`;
    const cfg = await db.getAsync(botNumber, key, null);
    const status = cfg && typeof cfg === "object" ? toBool(cfg.status) : true;
    return await message.sendreply?.(`Welcome is ${status ? "✅ ON" : "❌ OFF"} for this group.`);
  }

  if (raw !== "on" && raw !== "off") {
    return await message.send?.("❌ Invalid option. Use \`on\` or \`off\`.");
  }

  const botNumber = (message.conn?.user?.id && String(message.conn.user.id).split(":")[0]) || "bot";
  const key = `group:${groupJid}:welcome`;
  const cfg = { status: raw === "on" };
  await db.set(botNumber, key, cfg);
  await message.react?.("✅");
  return await message.send(cfg.status ? "✅ Welcome ENABLED for this group" : "❌ Welcome DISABLED for this group");
});

Module({
  command: "goodbye",
  package: "group",
  description: "Turn per-group goodbye ON or OFF (must be used inside the group).",
})(async (message, match) => {
  const groupJid =
    message.from ||
    message.chat ||
    message.key?.remoteJid ||
    (message.isGroup ? message.isGroup : null);
  if (!groupJid || !groupJid.includes("@g.us")) {
    return await message.send?.("❌ Use this command inside the group to toggle goodbye messages.");
  }

  const raw = (match || "").trim().toLowerCase();
  if (!raw) {
    const botNumber = (message.conn?.user?.id && String(message.conn.user.id).split(":")[0]) || "bot";
    const key = `group:${groupJid}:goodbye`;
    const cfg = await db.getAsync(botNumber, key, null);
    const status = cfg && typeof cfg === "object" ? toBool(cfg.status) : true;
    return await message.sendreply?.(`Goodbye is ${status ? "✅ ON" : "❌ OFF"} for this group.`);
  }

  if (raw !== "on" && raw !== "off") {
    return await message.send?.("❌ Invalid option. Use \`on\` or \`off\`.");
  }

  const botNumber = (message.conn?.user?.id && String(message.conn.user.id).split(":")[0]) || "bot";
  const key = `group:${groupJid}:goodbye`;
  const cfg = { status: raw === "on" };
  await db.set(botNumber, key, cfg);
  await message.react?.("✅");
  return await message.send(cfg.status ? "✅ Goodbye ENABLED for this group" : "❌ Goodbye DISABLED for this group");
});

/* ---------------- EVENT: group-participants.update ---------------- */
Module({ on: "group-participants.update" })(async (_msg, event, conn) => {
  try {
    if (!event || !event.id || !event.action || !Array.isArray(event.participants)) return;
    const groupJid = event.id;
    const groupName =
      event.groupName ||
      (event.groupMetadata && event.groupMetadata.subject) ||
      "Unknown Group";
    
    // Get group metadata
    let groupSize = 0;
    let adminCount = 0;
    try {
      const metadata = await conn.groupMetadata(groupJid);
      if (metadata) {
        groupSize = Array.isArray(metadata.participants) ? metadata.participants.length : 0;
        adminCount = Array.isArray(metadata.participants) ? 
          metadata.participants.filter(p => 
            p.admin === "admin" || p.admin === "superadmin"
          ).length : 0;
      }
    } catch (e) {
      console.error("[groupupdate] metadata fetch error:", e?.message || e);
    }

    const botNumber = (conn?.user?.id && String(conn.user.id).split(":")[0]) || "bot";
    const action = String(event.action).toLowerCase();
    const botJidFull = jidNormalizedUser(conn?.user?.id);
    const currentDate = formatDate();

    for (const p of event.participants) {
      const participantJid = jidNormalizedUser(typeof p === "string" ? p : p.id || p.jid || "");
      if (!participantJid) continue;
      if (botJidFull && participantJid === botJidFull) continue;

      // WELCOME (add/invite/join)
      if (action === "add" || action === "invite" || action === "joined") {
        const key = `group:${groupJid}:welcome`;
        const cfgRaw = await db.getAsync(botNumber, key, null);
        const enabled = cfgRaw && typeof cfgRaw === "object" ? toBool(cfgRaw.status) : false;
        if (!enabled) continue;

        const mentionText = `@${participantJid.split("@")[0]}`;
        const replacements = { 
          mentionText, 
          name: groupName, 
          size: groupSize,
          adminCount: adminCount,
          date: currentDate
        };
        
        const text = buildText(DEFAULT_WELCOME, replacements);
        
        try {
          // Récupérer la photo de profil du participant (ou image par défaut)
          const profileBuffer = await getParticipantProfile(conn, participantJid);
          await sendWelcomeMsg(conn, groupJid, text, [participantJid], profileBuffer);
        } catch (e) {
          console.error("[groupupdate] error sending welcome:", e?.message || e);
        }
      }

      // GOODBYE (remove/leave/left/kicked)
      if (action === "remove" || action === "leave" || action === "left" || action === "kicked") {
        const key = `group:${groupJid}:goodbye`;
        const cfgRaw = await db.getAsync(botNumber, key, null);
        const enabled = cfgRaw && typeof cfgRaw === "object" ? toBool(cfgRaw.status) : true;
        if (!enabled) continue;

        const mentionText = `@${participantJid.split("@")[0]}`;
        const replacements = { 
          mentionText, 
          name: groupName, 
          size: groupSize - 1, // Subtract 1 for leaving member
          adminCount: adminCount,
          date: currentDate
        };
        
        const text = buildText(DEFAULT_GOODBYE, replacements);
        
        try {
          // Récupérer la photo de profil du participant (ou image par défaut)
          const profileBuffer = await getParticipantProfile(conn, participantJid);
          await sendWelcomeMsg(conn, groupJid, text, [participantJid], profileBuffer);
        } catch (e) {
          console.error("[groupupdate] error sending goodbye:", e?.message || e);
        }
      }

      // PROMOTE / DEMOTE
      if (action === "promote" || action === "demote") {
        const owner = botJidFull || null;
        const ownerMention = owner ? `@${owner.split("@")[0]}` : conn.user?.id ? `@${String(conn.user.id).split(":")[0]}` : "Owner";
        const actor = event.actor || event.author || event.by || null;
        const actorText = actor ? `@${actor.split("@")[0]}` : "Admin";
        const targetText = `@${participantJid.split("@")[0]}`;
        const actionText = action === "promote" ? "promoted" : "demoted";
        const sendText = `╭─〔 *🎉 Admin Event* 〕\n├─ ${actorText} has ${actionText} ${targetText}\n├─ Group: ${groupName}\n╰─➤ Powered by ${ownerMention}`;
        
        try {
          const mentions = [actor, participantJid, botJidFull].filter(Boolean);
          if (owner) mentions.push(owner);
          
          await conn.sendMessage(groupJid, { 
            text: sendText, 
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
          });
        } catch (e) {
          console.error("[groupupdate] promote/demote send error:", e?.message || e);
          try { 
            await conn.sendMessage(groupJid, { text: sendText }); 
          } catch (_) {}
        }
      }
    }
  } catch (err) {
    console.error("[groupupdate] event handler error:", err?.message || err);
  }
});
