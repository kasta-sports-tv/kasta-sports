import express from "express";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 3000;

// кеш
let cachedPlaylist = null;
let lastUpdate = 0;
const CACHE_TIME = 10 * 60 * 1000; // 10 хв

const BASE_URL = "https://myfootball.pw";

app.get("/mf_playlist.m3u", async (req, res) => {
  try {

    // якщо кеш актуальний
    if (cachedPlaylist && Date.now() - lastUpdate < CACHE_TIME) {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.send(cachedPlaylist);
    }

    // 1️⃣ беремо головну сторінку
    const mainPage = await axios.get(BASE_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36"
      }
    });

    const html = mainPage.data;

    // 2️⃣ шукаємо всі матчі
    const matchRegex = /href="(\/[^"]+smotret-onlayn\.html)"/g;
    const matches = [...html.matchAll(matchRegex)];

    const uniqueLinks = [
      ...new Set(matches.map(m => BASE_URL + m[1]))
    ];

    let playlist = "#EXTM3U\n\n";

    // 3️⃣ заходимо в кожен матч
    for (const link of uniqueLinks) {
      try {
        const matchPage = await axios.get(link, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36"
          }
        });

        const matchHtml = matchPage.data;

        const sourceMatch = matchHtml.match(
          /const\s+sourceUrl\s*=\s*"([^"]+)"/
        );

        if (sourceMatch) {
          const streamUrl = sourceMatch[1];
          const title = link.split("/").pop().replace(".html", "");

          playlist += `#EXTINF:-1,${title}\n`;
          playlist += `#EXTVLCOPT:http-origin=${BASE_URL}\n`;
          playlist += `#EXTVLCOPT:http-referrer=${BASE_URL}/\n`;
          playlist += `${streamUrl}\n\n`;
        }

      } catch (e) {
        continue;
      }
    }

    // оновлюємо кеш
    cachedPlaylist = playlist;
    lastUpdate = Date.now();

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(playlist);

  } catch (error) {
    res.status(500).send("Error: " + error.message);
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
