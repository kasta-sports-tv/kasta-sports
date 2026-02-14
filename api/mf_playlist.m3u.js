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
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    // 1️⃣ Відкриваємо головну
    await page.goto("https://myfootball.pw/", {
      waitUntil: "networkidle0",
      timeout: 60000
    });

    await page.waitForTimeout(4000);

    // 2️⃣ Збираємо всі посилання на матчі
    const matchLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a[href*='smotret-onlayn.html']"))
        .map(a => a.href);
    });

    const uniqueLinks = [...new Set(matchLinks)];

    let playlist = "#EXTM3U\n\n";

    // 3️⃣ Проходимо по кожному матчу В ТІЙ ЖЕ вкладці
    for (const link of uniqueLinks) {
      try {

        await page.goto(link, {
          waitUntil: "networkidle0",
          timeout: 60000
        });

        await page.waitForTimeout(4000);

        const html = await page.content();

        // 🔥 Збираємо всі прямі m3u8
        const matches = [...html.matchAll(/https?:\/\/[^"'\\s]+\.m3u8[^"'\\s]*/g)];

        if (matches.length === 0) {
          continue; // якщо сторінка пуста — пропускаємо
        }

        for (let i = 0; i < matches.length; i++) {
          const streamUrl = matches[i][0];

          const baseTitle = link.split("/").pop().replace(".html", "");
          const title = matches.length > 1
            ? `${baseTitle} [${i + 1}]`
            : baseTitle;

          playlist += `#EXTINF:-1,${title}\n`;
          playlist += `#EXTVLCOPT:http-origin=https://myfootball.pw\n`;
          playlist += `#EXTVLCOPT:http-referrer=https://myfootball.pw/\n`;
          playlist += `${streamUrl}\n\n`;
        }

      } catch (e) {
        continue;
      }
    }

    await browser.close();

    // Якщо нічого не знайдено — не кешуємо пустоту
    if (playlist.trim() === "#EXTM3U") {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.status(200).send("#EXTM3U\n");
      return;
    }

    cachedPlaylist = playlist;
    lastUpdate = Date.now();

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.status(200).send(playlist);

  } catch (error) {
    if (browser) await browser.close();
    res.status(500).send("Error: " + error.message);
  }
}
