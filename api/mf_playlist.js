import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const BASE = "https://myfootball.pw";

const CACHE_TTL = 5 * 60 * 1000;
let cachedPlaylist = null;
let cacheTimestamp = null;

export const config = {
  runtime: "nodejs",
  maxDuration: 60
};

export default async function handler(req, res) {
  try {
    if (cachedPlaylist && Date.now() - cacheTimestamp < CACHE_TTL) {
      return res
        .status(200)
        .setHeader("Content-Type", "application/vnd.apple.mpegurl")
        .send(cachedPlaylist);
    }

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: "networkidle2", timeout: 60000 });

    // Чекаємо щоб JS дорендерив DOM
    await page.waitForTimeout(3000);

    // 🔍 Збираємо всі матчі
    const matchLinks = await page.evaluate((base) => {
      const links = Array.from(
        document.querySelectorAll('a[href*="smotret-onlayn.html"]')
      ).map(a => a.getAttribute("href"));

      return [...new Set(links)].map(link =>
        link.startsWith("http") ? link : base + link
      );
    }, BASE);

    const streams = [];

    for (const link of matchLinks) {
      try {
        const matchPage = await browser.newPage();
        await matchPage.goto(link, {
          waitUntil: "networkidle2",
          timeout: 60000
        });

        await matchPage.waitForTimeout(3000);

        // 🔥 Ловимо m3u8 вже після виконання JS
        const m3u8 = await matchPage.evaluate(() => {
          const scripts = Array.from(document.querySelectorAll("script"))
            .map(s => s.innerHTML)
            .join("\n");

          const match = scripts.match(
            /https?:\/\/[^"'\\]+\.m3u8[^"'\\]*/i
          );

          return match ? match[0] : null;
        });

        if (m3u8) {
          const title = link
            .split("/")
            .pop()
            .replace(".html", "")
            .replace(/-/g, " ");

          streams.push({ title, url: m3u8 });
        }

        await matchPage.close();
      } catch (e) {
        console.log("Error match:", e.message);
      }
    }

    await browser.close();

    if (streams.length === 0) {
      return res
        .status(200)
        .setHeader("Content-Type", "application/vnd.apple.mpegurl")
        .send("#EXTM3U\n# No live matches found");
    }

    let m3u = "#EXTM3U\n\n";

    for (const s of streams) {
      m3u += `#EXTINF:-1 group-title="MyFootball",${s.title}\n`;
      m3u += `${s.url}\n\n`;
    }

    cachedPlaylist = m3u;
    cacheTimestamp = Date.now();

    return res
      .status(200)
      .setHeader("Content-Type", "application/vnd.apple.mpegurl")
      .send(m3u);

  } catch (err) {
    console.error(err);
    return res.status(500).send("Error: " + err.message);
  }
}
