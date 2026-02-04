const axios = require("axios");
const yts = require("yt-search");
const { getBuffer } = require("../../lib/handier");
const { fetchJson } = require("i-nrl");

/* =========================
   SONG MODULE
========================= */
Module({
  command: "song",
  package: "downloader",
  description: "Download audio from YouTube",
})(async (message, match) => {
  if (!match) return message.send("_need a yt url or song name_");

  const input = match.trim();

  try {
    await handleSongDownload(message.conn, input, message);
  } catch (err) {
    console.error("[PLUGIN SONG] Error:", err?.message || err);
    await message.send("⚠️ Song download failed. Please try again later.");
  }
});

/* =========================
   SONG HANDLER
========================= */
async function handleSongDownload(Aliconn, searchQuery, message) {
  try {
    let buffer;
    let title;
    let audioUrl;
    let sourceUrl;

    // buffer helper with headers
    const getBufferWithHeaders = async (url) => {
      const res = await axios({
        method: "GET",
        url,
        responseType: "arraybuffer",
        timeout: 60000,
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Referer": "https://www.youtube.com/",
        },
      });
      return Buffer.from(res.data);
    };

    // 🔍 song name হলে YouTube search
    if (!searchQuery.startsWith("http")) {
      const search = await yts(searchQuery);
      if (!search.videos || search.videos.length === 0) {
        return message.send("❌ No results found");
      }
      sourceUrl = search.videos[0].url;
    } else {
      sourceUrl = searchQuery;
    }

    // 🎵 NEW API CALL
    const api = await fetchJson(
      `https://api-aswin-sparky.koyeb.app/api/downloader/song?search=${encodeURIComponent(
        sourceUrl
      )}`
    );

    if (!api.status || !api.data) {
      return message.send("❌ Failed to fetch song");
    }

    title = api.data.title;
    audioUrl = api.data.url;

    // 📥 download audio buffer
    try {
      buffer = await getBufferWithHeaders(audioUrl);
    } catch {
      buffer = await getBuffer(audioUrl);
    }

    // 📤 send audio
    await Aliconn.sendMessage(
      message.from,
      {
        audio: buffer,
        mimetype: "audio/mpeg",
        contextInfo: {
          externalAdReply: {
            title: title,
            body: "𝙼𝙰𝙳𝙴 𝙸𝙽 𝙱𝚈 𝙸𝙽𝙲𝙾𝙽𝙽𝚄 𝙱𝙾𝚈",
            mediaType: 1,
            sourceUrl: sourceUrl,
          },
        },
      },
      { quoted: message.raw }
    );
  } catch (err) {
    console.error("[SONG HANDLER ERROR]", err);
    throw err;
  }
}
