import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export const config = {
  runtime: "nodejs18.x",
  maxDuration: 60
};

// Кеш
let cachedPlaylist = null;
let lastUpdate = 0;
const CACHE_TIME = 10 * 60 * 1000; // 10 хв

export default async function handler(req, res) {
  try {

    // Якщо кеш актуальний — віддаємо його
    if (cachedPlaylist && Date.now() - lastUpdate < CACHE_TIME) {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.status(200).send(cachedPlaylist);
    }

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();

    // 1️⃣ Відкриваємо головну
    await page.goto("https://myfootball.pw/", {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    // 2️⃣ Забираємо всі посилання на матчі
    const matchLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a"))
        .map(a => a.href)
        .filter(href =>
          href.includes("smotret-onlayn.html")
        );
    });

    const uniqueLinks = [...new Set(matchLinks)].slice(0, 20); // максимум 20 щоб не вбити Vercel

    let playlist = "#EXTM3U\n\n";

    // 3️⃣ Заходимо в кожен матч
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

    // Оновлюємо кеш
    cachedPlaylist = playlist;
    lastUpdate = Date.now();

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.status(200).send(playlist);

  } catch (error) {
    res.status(500).send("Error: " + error.message);
  }
}
