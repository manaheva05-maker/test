const axios = require("axios");
const qs = require("qs");

async function YouTubeDL(query) {
  // 1️⃣ Préparer la requête de recherche
  const searchData = qs.stringify({
    query: query,
    vt: "home",
  });

  const headers = {
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "accept": "*/*",
    "x-requested-with": "XMLHttpRequest",
  };

  // 2️⃣ Requête search
  const searchResponse = await axios.post(
    "https://ssvid.net/api/ajax/search",
    searchData,
    { headers }
  );

  if (searchResponse.data.status !== "ok") {
    throw new Error("Failed to fetch video");
  }

  const { vid, links, title } = searchResponse.data;

  // 3️⃣ Récupérer la clé MP3 (128kbps)
  const mp3Key = links?.mp3?.mp3128?.k;
  if (!mp3Key) {
    throw new Error("No mp3 download link found");
  }

  // 4️⃣ Requête de conversion
  const convertData = qs.stringify({
    vid: vid,
    k: mp3Key,
  });

  const convertResponse = await axios.post(
    "https://ssvid.net/api/ajax/convert",
    convertData,
    { headers }
  );

  // 5️⃣ Résultat final
  return {
    title: title,
    url: convertResponse.data.dlink,
  };
}

module.exports = {
  YouTubeDL,
};
