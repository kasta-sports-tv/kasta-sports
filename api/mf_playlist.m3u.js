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

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    let playlist = "#EXTM3U\n\n";

    // 1️⃣ Відкриваємо головний sitemap
    await page.goto("https://myfootball.pw/sitemap.xml", {
      waitUntil: "networkidle0",
      timeout: 60000
    });

    const sitemapXml = await page.content();

    // 2️⃣ Витягуємо всі sitemap-файли
    const sitemapMatches = [...sitemapXml.matchAll(/https?:\/\/[^<]+sitemap\d+\.xml/g)];
    const sitemapLinks = sitemapMatches.map(m => m[0]);

    // 3️⃣ Проходимо по кожному sitemap
    for (const sitemapUrl of sitemapLinks) {
      try {
        await page.goto(sitemapUrl, {
          waitUntil: "networkidle0",
          timeout: 60000
        });

        const subXml = await page.content();

        // Беремо тільки сторінки матчів
        const pageMatches = [...subXml.matchAll(/https?:\/\/[^<]+smotret-onlayn\.html/g)];
        const matchLinks = pageMatches.map(m => m[0]);

        for (const link of matchLinks) {
          try {
            await page.goto(link, {
              waitUntil: "networkidle0",
              timeout: 60000
            });

            await page.waitForTimeout(2000);

            const html = await page.content();
            const streamMatches = [...html.matchAll(/https?:\/\/[^"'\\s]+\.m3u8[^"'\\s]*/g)];

            if (streamMatches.length === 0) continue;

            for (let i = 0; i < streamMatches.length; i++) {
              const streamUrl = streamMatches[i][0];
              const baseTitle = link.split("/").pop().replace(".html", "");
              const title = streamMatches.length > 1
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

      } catch (e) {
        continue;
      }
    }

    await browser.close();

    if (playlist.trim() === "#EXTM3U") {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.status(200).send("#EXTM3U\n");
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
