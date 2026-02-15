import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export const config = {
  runtime: "nodejs",
  maxDuration: 120
};

let cachedPlaylist = null;
let lastUpdate = 0;
const CACHE_TIME = 10 * 60 * 1000;

export default async function handler(req, res) {
  let browser = null;

  try {
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
      headless: true
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    );

    // 🧠 Формуємо сьогоднішню дату в форматі DDMMYYYY
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const yyyy = today.getFullYear();
    const todayString = `${dd}${mm}${yyyy}`;

    // 1️⃣ Беремо sitemap
    await page.goto("https://myfootball.pw/sitemap.xml", {
      waitUntil: "networkidle0",
      timeout: 60000
    });

    const sitemap = await page.content();

    // 2️⃣ Витягуємо тільки матчі сьогоднішньої дати
    const matchLinks = [...sitemap.matchAll(
      new RegExp(`https://myfootball\\.pw/[^"]*${todayString}-smotret-onlayn\\.html`, "g")
    )].map(m => m[0]);

    if (matchLinks.length === 0) {
      await browser.close();
      return res.status(200).send("#EXTM3U\n");
    }

    let playlist = "#EXTM3U\n\n";

    // 3️⃣ Заходимо в кожен матч
    for (const link of matchLinks) {
      try {
        await page.goto(link, {
          waitUntil: "networkidle0",
          timeout: 60000
        });

        await page.waitForTimeout(2000);

        const html = await page.content();
        const streams = [...html.matchAll(/https?:\/\/[^"'\\s]+\.m3u8[^"'\\s]*/g)];

        if (streams.length === 0) continue;

        for (let i = 0; i < streams.length; i++) {
          const streamUrl = streams[i][0];
          const baseTitle = link.split("/").pop().replace(".html", "");
          const title = streams.length > 1 ? `${baseTitle} [${i + 1}]` : baseTitle;

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

    cachedPlaylist = playlist;
    lastUpdate = Date.now();

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.status(200).send(playlist);

  } catch (error) {
    if (browser) await browser.close();
    res.status(500).send("Error: " + error.message);
  }
}
