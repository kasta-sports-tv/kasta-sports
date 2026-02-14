import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export const config = {
  runtime: "nodejs",
  maxDuration: 60
};

// Кеш
let cachedPlaylist = null;
let lastUpdate = 0;
const CACHE_TIME = 10 * 60 * 1000; // 10 хв

export default async function handler(req, res) {
  let browser = null;

  try {
    // Якщо кеш актуальний — віддаємо його
    if (cachedPlaylist && Date.now() - lastUpdate < CACHE_TIME) {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.status(200).send(cachedPlaylist);
    }

    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--single-process"
      ],
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    );

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });
    });

    // 1️⃣ Відкриваємо головну
    await page.goto("https://myfootball.pw/", {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    // 2️⃣ Забираємо всі посилання на матчі
    const matchLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a"))
        .map(a => a.href)
        .filter(href => href.includes("smotret-onlayn.html"));
    });

    const uniqueLinks = [...new Set(matchLinks)].slice(0, 15);

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

        // 🔥 Витягуємо ВСІ m3u8 з HTML
        const matches = [...html.matchAll(/https?:\/\/[^"'\\s]+\.m3u8[^"'\\s]*/g)];
        const uniqueStreams = [...new Set(matches.map(m => m[0]))];

        if (uniqueStreams.length > 0) {
          for (const streamUrl of uniqueStreams) {
            const title = link.split("/").pop().replace(".html", "");

            playlist += `#EXTINF:-1,${title}\n`;
            playlist += `#EXTVLCOPT:http-origin=https://myfootball.pw\n`;
            playlist += `#EXTVLCOPT:http-referrer=https://myfootball.pw/\n`;
            playlist += `${streamUrl}\n\n`;
          }
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
    if (browser) await browser.close();
    res.status(500).send("Error: " + error.message);
  }
}
