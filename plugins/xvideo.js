import axios from "axios";
import { Module } from "../lib/plugins.js";

// Temporary session storage
const sessions = {};

const API_KEY = ""; // যদি প্রয়োজন হয়

// ================== Step 1: Search ==================
Module({
  command: "xvideo",
  package: "video",
  description: "Search XVideos and download",
})(async (message, match) => {
  try {
    if (!match) return message.send("❌ Enter search query");

    const userId = message.from;
    await message.react("🔍");

    // Call search API
    const apiUrl = `https://apis.davidcyril.name.ng/search/xvideo?text=${encodeURIComponent(match)}`;
    const { data } = await axios.get(apiUrl, { timeout: 30000 });

    if (!data || !data.success || !data.result || data.result.length === 0) {
      return message.send("❌ No videos found");
    }

    // Take top 10 results
    const videos = data.result.slice(0, 10);
    sessions[userId] = videos; // Save session

    // Send list message
    let listMsg = "🎬 *XVideo Search Results:*\n\n";
    videos.forEach((v, i) => {
      listMsg += `${i + 1}. ${v.title}\n⏱ ${v.duration || "N/A"} | ${v.quality || "N/A"}\n`;
    });
    listMsg += "\nReply with the number (1-10) to download.";

    await message.send(listMsg);

  } catch (err) {
    console.error("[XVIDEOS SEARCH ERROR]", err);
    await message.send("⚠️ Search failed");
  }
});

// ================== Step 2: Reply Handler ==================
Module({
  onMessage: true, // capture all replies
})(async (message) => {
  const userId = message.from;
  const reply = message.body?.trim();

  if (!sessions[userId]) return; // no active session

  const videos = sessions[userId];
  const index = parseInt(reply) - 1;

  if (isNaN(index) || index < 0 || index >= videos.length) {
    return message.send("❌ Invalid selection. Choose 1-10");
  }

  const selected = videos[index];

  try {
    // Call download API
    const downloadApi = `https://apis.davidcyril.name.ng/xvideo?url=${encodeURIComponent(selected.url)}&apikey=${API_KEY}`;
    const { data } = await axios.get(downloadApi, { timeout: 30000 });

    if (!data || !data.success || !data.download_url) {
      return message.send("❌ Download failed");
    }

    // Send video to user
    await message.send({
      video: { url: data.download_url },
      mimetype: "video/mp4",
      fileName: `${data.title || selected.title}.mp4`,
      caption: `🎬 *Title:* ${data.title || selected.title}`,
    });

    delete sessions[userId]; // Clear session

  } catch (err) {
    console.error("[XVIDEOS DOWNLOAD ERROR]", err);
    await message.send("⚠️ Download failed");
  }
});
