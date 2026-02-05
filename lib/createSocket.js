// lib/createSocket.js
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from "@whiskeysockets/baileys";
import pino from "pino";
import path from "path";
import fs from "fs/promises";
import mongoStore from "./mongoStore.js";

async function saveSessionToMongo(sessionId, authState) {
  try {
    const keysArray = [];
    for (const [id, key] of authState.keys.entries()) {
      keysArray.push([id, key]);
    }
    
    await mongoStore.saveSession(sessionId, {
      creds: authState.creds,
      keys: keysArray
    });
  } catch (error) {
    console.warn(`[${sessionId}] Failed to save session to MongoDB:`, error.message);
  }
}

async function restoreSessionFromMongo(sessionId) {
  try {
    const saved = await mongoStore.loadSession(sessionId);
    if (!saved || !saved.creds) {
      return null;
    }
    
    console.log(`[${sessionId}] Restoring session from MongoDB`);
    
    const keys = new Map(saved.keys || []);
    
    return {
      creds: saved.creds,
      keys
    };
  } catch (error) {
    console.warn(`[${sessionId}] Failed to restore session from MongoDB:`, error.message);
    return null;
  }
}

export async function createSocket(sessionId) {
  await mongoStore.connect();
  
  const sessionsDir = path.join(process.cwd(), "sessions");
  await fs.mkdir(sessionsDir, { recursive: true });
  const sessionPath = path.join(sessionsDir, sessionId);
  
  let authState;
  const restoredState = await restoreSessionFromMongo(sessionId);
  
  if (restoredState) {
    console.log(`[${sessionId}] Using restored session from MongoDB`);
    authState = {
      state: {
        creds: restoredState.creds,
        keys: restoredState.keys
      },
      saveCreds: () => {}
    };
  } else {
    const multiFileAuth = await useMultiFileAuthState(sessionPath);
    authState = multiFileAuth;
  }
  
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    auth: {
      creds: authState.state.creds,
      keys: makeCacheableSignalKeyStore(authState.state.keys, pino({ level: "silent" })),
    },
    browser: Browsers.ubuntu("Chrome"),
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    markOnlineOnConnect: true,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", async (creds) => {
    authState.state.creds = creds;
    await saveSessionToMongo(sessionId, authState.state);
    
    if (authState.saveCreds && typeof authState.saveCreds === 'function') {
      await authState.saveCreds();
    }
  });

  sock.sessionId = sessionId;

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log(`[${sessionId}] QR code generated`);
      await mongoStore.deleteSession(sessionId);
    }
    
    if (connection === "open") {
      console.log(`[${sessionId}] ✅ Connection opened successfully`);
      await saveSessionToMongo(sessionId, authState.state);
    }
    
    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`[${sessionId}] Connection closed: ${statusCode}`);
      
      if (statusCode !== 401 && statusCode !== 403 && statusCode !== 419) {
        await saveSessionToMongo(sessionId, authState.state);
      } else {
        await mongoStore.deleteSession(sessionId);
      }
    }
  });

  return sock;
}
