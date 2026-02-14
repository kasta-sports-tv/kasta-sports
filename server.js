import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

// Кеш
let cachedPlaylist = null;
let lastUpdate = 0;
const CACHE_TIME = 10 * 60 * 1000; // 10 хв

app.get("/mf_playlist.m3u", async (req, res) => {
  try {

    if (cachedPlaylist && Date.now() - lastUpdate < CACHE_TIME) {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.send(cachedPlaylist);
    }

    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36"
    );

    await page.goto("https://myfootball.pw/", {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    const matchLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a"))
        .map(a => a.href)
        .filter(href => href.includes("smotret-onlayn.html"));
    });

    const uniqueLinks = [...new Set(matchLinks)];

    let playlist = "#EXTM3U\n\n";

    for (const link of uniqueLinks) {
      try {
        const matchPage = await browser.newPage();

        await matchPage.goto(link, {
          waitUntil: "networkidle2",
          timeout: 60000
        });

        const html = await matchPage.content();
        const match = html.match(/const\s+sourceUrl\s*=\s*"([^"]+)"/);

        if (match) {
          const streamUrl = match[1];
          const title = link.split("/").pop().replace(".html", "");

          playlist += `#EXTINF:-1,${title}\n`;
          playlist += `#EXTVLCOPT:http-origin=https://myfootball.pw\n`;
          playlist += `#EXTVLCOPT:http-referrer=https://myfootball.pw/\n`;
          playlist += `${streamUrl}\n\n`;
        }

        await matchPage.close();

      } catch (e) {
        continue;
      }
    }

    await browser.close();

    cachedPlaylist = playlist;
    lastUpdate = Date.now();

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(playlist);

  } catch (err) {
    res.status(500).send("Error: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
