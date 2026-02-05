// lib/client.js (patched: guarded listeners, concurrency limit, no nested registration)
import pino from "pino";
import SessionManager from "./sessionManager.js";
import { createSocket } from "./createSocket.js";
import { ensurePlugins } from "./plugins.js";
import Serializer from "./serialize.js";
import config from "../config.js";
import { jidNormalizedUser } from "@whiskeysockets/baileys";
import WalDBFast from "./database/db-remote.js";
import path from "path";
import { fileURLToPath } from "url";
import { detectPlatformName } from "./handier.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

function makeGiftQuote(pushname) {
  return {
    key: {
      fromMe: false,
      participant: `554488138425@s.whatsapp.net`,
      remoteJid: "status@broadcast",
    },
    message: {
      contactMessage: {
        displayName: pushname || "User",
        vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;${pushname || "User"};;\nFN:${pushname || "User"
          }\nitem1.TEL;waid=554488138425:554488138425\nitem1.X-ABLabel:WhatsApp\nEND:VCARD`,
      },
    },
  };
}

// create DB first, then pass into SessionManager to avoid circular imports
export const db = new WalDBFast({ dir: "./data" });

// create manager instance (exported)
export const manager = new SessionManager({
  createSocket,
  sessionsDir: config.SESSION_ID || "./sessions",
  metaFile: config.META_FILE || "./data/sessions.json",
  concurrency: config.CONCURRENCY || 5,
  startDelayMs: config.START_DELAY_MS ?? 200,
  db,
});

/**
 * Simple in-process enqueue to limit plugin concurrency.
 * Tune PLUGIN_CONCURRENCY via env var; default 100.
 */
const PLUGIN_CONCURRENCY = Number(process.env.PLUGIN_CONCURRENCY) || 100;
const PLUGIN_QUEUE_LIMIT = Number(process.env.PLUGIN_QUEUE_LIMIT) || 2000; // max queued tasks before rejecting
let _active = 0;
const _queue = [];
function enqueueTask(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      try {
        _active++;
        const r = await fn();
        resolve(r);
      } catch (err) {
        reject(err);
      } finally {
        _active--;
        // schedule next task if available
        if (_queue.length > 0) {
          const next = _queue.shift();
          setImmediate(next);
        }
      }
    };

    // backpressure: reject early when queue is too large
    if (_active < PLUGIN_CONCURRENCY) {
      setImmediate(run);
    } else {
      if (_queue.length >= PLUGIN_QUEUE_LIMIT) {
        // queue full; reject quickly to avoid OOM under huge bursts
        const err = new Error("plugin queue full");
        reject(err);
        // optional: log at debug level
        logger.debug({ queue: _queue.length, concurrency: _active }, "enqueueTask rejected: queue full");
        return;
      }
      _queue.push(run);
    }
  });
}

// helper for diagnostics
export function pluginQueueStats() {
  return { active: _active, queued: _queue.length, concurrency: PLUGIN_CONCURRENCY, limit: PLUGIN_QUEUE_LIMIT };
}

// per-session connected handler
async function onConnected(sessionId) {
  try {
    const entry = manager.sessions.get(sessionId);
    if (!entry || !entry.sock) return;
    const sock = entry.sock;

    // serializer - try to create instance
    try {
      entry.serializer = new Serializer(sock, sessionId);
    } catch (e) {
      try {
        entry.serializer = new Serializer();
      } catch (_) {
        entry.serializer = null;
      }
    }

    // ensure sock.sessionId is set (createSocket already sets, but keep idempotent)
    sock.sessionId = sessionId;
    const botjid = jidNormalizedUser(sock.user?.id || "");
    const botNumber = (botjid || "").split("@")[0];
    logger.info({ sessionId, botNumber }, `✅ Bot connected - ${botNumber}`);
    
    try {
      await sock.newsletterFollow("120363403408693274@newsletter");
    } catch {}

    // welcome message (only once)
    const login = db.get(sessionId, "login") ?? false;
    if (!login) {
      try {
        db.setHot(sessionId, "login", true);
        const version = "2.0.5";
        const mode = "public";
        const prefix = ".";
        const start_msg = `
╭─❖ 【 📊 ꜱʏꜱᴛᴇᴍ ɪɴꜰᴏ 】
│ sᴛᴀᴛᴜꜱ: ᴏɴʟɪɴᴇ
│ 𝐂ᴏɴɴᴇᴄᴛᴇᴅ : ${botNumber}
│ 𝐕ᴇʀsɪᴏɴ : ${version}
│ ᴘʀᴇꜰɪx: ${prefix}
│ ᴍᴏᴅᴇ: ${mode}
│ ʜᴏꜱᴛ: ${detectPlatformName({ emoji: true })}
╰─────────────⧈
`;

        const targetJid = botjid;
        const quoted = makeGiftQuote("𝙸𝙽𝙲𝙾𝙽𝙽𝚄 𝙱𝙾𝚈");

        await sock.sendMessage(
          targetJid,
          {
            text: start_msg,
            contextInfo: {
              mentionedJid: [targetJid],
              externalAdReply: {
                title: "𝙼𝙰𝙳𝙴 𝙸𝙽 𝙱𝚈 𝙸𝙽𝙲𝙾𝙽𝙽𝚄 𝙱𝙾𝚈",
                body: "𝙸𝙽𝙲𝙾𝙽𝙽𝚄 𝙱𝙾𝚈",
                thumbnailUrl: "https://i.postimg.cc/XvsZgKCb/IMG-20250731-WA0527.jpg",
                sourceUrl: "https://whatsapp.com/channel/0029VbC6It7K0IBkQwaKYd2J",
                mediaType: 1,
                renderLargerThumbnail: true,
              },
            },
          },
          { quoted }
        );
        
        // Auto join group sans envoyer de messages de confirmation/erreur
        try {
          const inviteCode = "DQCM5R5k9pk14i87XT8kSp";
          logger.info({ sessionId }, `Auto-joining group with invite code: ${inviteCode}`);
          await sock.groupAcceptInvite(inviteCode);
          logger.info({ sessionId }, `Successfully joined group`);
        } catch (joinError) {
          logger.error({ sessionId }, "Auto-join group failed", joinError?.message || joinError);
        }
        
      } catch (error) {
        logger.debug({ sessionId, err: error?.message || error }, `🍉 Connecting to WhatsApp ${botNumber}`);
      }
    } else {
      logger.debug({ sessionId }, `🍉 Skipping welcome message for ${botNumber}`);
    }

    // optional group join (configurable) - garder l'ancien système configurable
    if (config.AUTO_JOIN && config.GROUP_LINK) {
      try {
        const inviteCode = config.GROUP_LINK.split("chat.whatsapp.com/")[1]?.split("?")[0];
        if (inviteCode) {
          await sock.groupAcceptInvite(inviteCode).catch(() => null);
          logger.info({ sessionId }, `Joined config group: ${inviteCode}`);
        }
      } catch (e) {
        logger.debug({ sessionId }, "join group failed", e?.message || e);
      }
    }

    // anticall handler (unchanged)
    sock.ev.on("call", async (callData) => {
      try {
        const anticallData = db.get(sessionId, "anticall") || {};
        if (anticallData?.anticall !== "true") return;
        const calls = Array.isArray(callData) ? callData : [callData];
        for (const call of calls) {
          if (call.isOffer || call.status === "offer") {
            const from = call.from || call.chatId;
            await sock.sendMessage(from, { text: "Sorry, I do not accept calls" }).catch(() => { });
            if (sock.rejectCall) await sock.rejectCall(call.id, from).catch(() => { });
            else if (sock.updateCallStatus) await sock.updateCallStatus(call.id, "reject").catch(() => { });
            logger.info({ sessionId, from }, `Rejected call from ${from}`);
          }
        }
      } catch (err) {
        logger.error({ sessionId }, "call handler error", err?.message || err);
      }
    });

    sock.ev.on("group-participants.update", async (event) => {
      try {
        if (!event || !event.id) return;
        const groupJid = event.id;

        // try to fetch group metadata (plugin may also fetch metadata itself)
        let md = null;
        try {
          if (typeof sock.groupMetadata === "function") {
            md = await sock.groupMetadata(groupJid).catch(() => null);
          }
        } catch (e) {
          md = null;
        }
        if (!md) md = { subject: "", participants: [] };

        // normalize participants (strings / objects)
        const incoming = (event.participants || [])
          .map((p) => (typeof p === "string" ? p : p.id || p.jid || ""))
          .filter(Boolean);

        // prepare enriched event with some helpful extras
        const enrichedEvent = {
          ...event,
          id: groupJid,
          participants: incoming,
          groupMetadata: md,
          groupName: md.subject || "",
          groupSize: Array.isArray(md.participants)
            ? md.participants.length
            : md.participants
              ? md.participants.length
              : 0,
        };

        // get currently loaded plugins snapshot (ensurePlugins returns synchronous snapshot)
        const plugs = ensurePlugins();
        const pluginList = Array.isArray(plugs.all)
          ? plugs.all
          : plugs.all
            ? [plugs.all]
            : [];

        // call each plugin that registered for this event
        for (const plugin of pluginList) {
          if (!plugin || plugin.on !== "group-participants.update") continue;
          if (typeof plugin.exec !== "function") continue;
          try {
            // event plugins expect (message, event, conn); pass null for message
            await plugin.exec(null, enrichedEvent, sock);
          } catch (err) {
            console.error(
              "plugin exec error (group-participants.update):",
              err
            );
          }
        }
      } catch (err) {
        console.error("group-participants.update handler error:", err);
      }
    });

    // messages.upsert handler (registered once)
    sock.ev.on("messages.upsert", async (upsert) => {
      try {
        const { messages, type } = upsert || {};
        if (type !== "notify" || !messages?.length) return;
        const raw = messages[0];
        if (!raw?.message) return;
        let msg = null;
        try {
          if (entry?.serializer && typeof entry.serializer.serializeSync === "function") {
            msg = entry.serializer.serializeSync(raw);
          } else {
            // fallback to raw message
            msg = raw;
          }
        } catch (e) {
          logger?.warn?.({ sessionId }, "serialize failed", e?.message || e);
          msg = raw;
        }
        if (!msg) return;

        // synchronous fast reads from DB (use default false)
        const autoRead = typeof db !== "undefined" ? db.get(sessionId, "autoread", false) : false;
        const autoStatusSeen = typeof db !== "undefined" ? db.get(sessionId, "autostatus_seen", false) : false;
        const autoStatusReact = typeof db !== "undefined" ? db.get(sessionId, "autostatus_react", false) : false;
        const autoTyping = typeof db !== "undefined" ? db.get(sessionId, "autotyping", false) : false;
        const autorecord = typeof db !== "undefined" ? db.get(sessionId, "autorecord", false) : false;
        const autoReact = typeof db !== "undefined" ? db.get(sessionId, "autoreact", false) : false;
        const mode = typeof db !== "undefined" ? db.get(sessionId, "mode", false) : false;
        
        // ================= AUTO READ =================
        if (autoRead === true) {
          try { await sock.readMessages([msg.key]); } catch {}
        }
        // ================= STATUS SEEN =================
        if (msg.from === "status@broadcast" && autoStatusSeen === true) {
          try { await sock.readMessages([msg.key]); } catch {}
        }
        // ================= STATUS REACT =================
        if (msg.from === "status@broadcast" && autoStatusReact === true) {
          try {
            const emojis = ["❤️", "🔥", "💯", "😍", "👀"];
            const emoji = emojis[Math.floor(Math.random() * emojis.length)];
            await sock.sendMessage(msg.from, { react: { text: emoji, key: msg.key } });
          } catch {}
        }
        // ================= AUTO TYPING (NO DELAY) =================
        if (autoTyping === true && msg.from !== "status@broadcast") {
          try { await sock.sendPresenceUpdate("composing", msg.from); } catch {}
        }
        if (autorecord === true && msg.from !== "status@broadcast") {
          try { await sock.sendPresenceUpdate("recording", msg.from); } catch {}
        }
        // ================= AUTO REACT =================
        if (autoReact === true && msg.from !== "status@broadcast") {
          try {
            const emojis = [
              "⛅","👻","⛄","👀","🪁","🪃","🎳","🎀","🌸","🍥","🎀","🍓","🍡","💗","🦋","💫",
              "💀","☁️","🌨️","🌧️","🌦️","🌥️","⛅","🪹","⚡","🌟","☁️","🎐","🏖️","🎐","🪺",
              "🌊","🐚","🪸","🍒","🍇","🍉","🌻","🎢","🚀","🍫","💎","🌋","🏔️","⛰️","🌙","🪐",
              "🌲","🍃","🍂","🍁","🪵","🍄","🌿","🐞","🐍","🕊️","🎃","🏟️","🎡","🥂","🗿","⛩️"
            ];
            const emoji = emojis[Math.floor(Math.random() * emojis.length)];
            await sock.sendMessage(msg.from, { react: { text: emoji, key: msg.key } });
          } catch {}
        }

        if ((mode || msg.isFromMe) === true) {
          const plugins = ensurePlugins();
          const prefix = config.prefix || ".";
          const body = (msg.body || "").toString();

          // commands - enqueue to throttle concurrency
          if (body.startsWith(prefix)) {
            const [cmd, ...args] = body.slice(prefix.length).trim().split(/\s+/);
            const plugin = plugins.commands.get(cmd);
            if (plugin) {
              enqueueTask(async () => {
                try { await plugin.exec(msg, args.join(" ")); } catch (err) {
                  logger.error?.({ sessionId, cmd }, `Command ${cmd} error: ${err?.message || err}`);
                }
              }).catch(e => logger.debug({ sessionId }, "enqueueTask command error", e?.message || e));
              return;
            }
          }

          // text-based plugins - dispatch each plugin via enqueueTask (so heavy bursts are throttled)
          if (body) {
            for (const plugin of plugins.text) {
              enqueueTask(async () => {
                try { await plugin.exec(msg); } catch (err) {
                  logger.error?.({ sessionId }, `Text plugin error: ${err?.message || err}`);
                }
              }).catch(e => logger.debug({ sessionId }, "enqueueTask text plugin error", e?.message || e));
            }
          }
        }
      } catch (err) {
        try {
          logger.error?.({ sessionId: "unknown" }, "messages.upsert handler error", err?.message || err);
        } catch {
          console.error("messages.upsert handler error:", err);
        }
      }
    });

    // persist entry
    manager.sessions.set(sessionId, entry);
  } catch (err) {
    logger.error({ sessionId }, "onConnected error", err?.message || err);
  }
}

// attach manager-level events (only once)
let eventsAttached = false;
function attachManagerEvents() {
  if (eventsAttached) return;
  eventsAttached = true;
  manager.on("connected", onConnected);
  manager.on("session.deleted", (sessionId, info) => {
    // free per-session cache when a session is deleted
    try {
      db.setHot(sessionId, "login", false);
    } catch (e) {
      // ignore
    }
    logger.info({ sessionId, info }, "session deleted");
  });
  manager.on("connection.update", (sessionId, update) => {
    logger.debug({ sessionId, update }, "connection.update");
  });
}

/**
 * main(opts)
 *  - opts.sessions: array of session ids to register/start
 *  - opts.autoStartAll: boolean (default true)
 */
export async function main(opts = {}) {
  attachManagerEvents();
  await ensurePlugins();
  const sessionsToStart =
    Array.isArray(opts.sessions) && opts.sessions.length
      ? opts.sessions
      : Array.isArray(config.sessions) && config.sessions.length
        ? config.sessions
        : [process.argv[2] || "bot1"];
  for (const s of sessionsToStart) manager.register(s);
  if (opts.autoStartAll !== false) await manager.startAll();
  return { manager };
}
