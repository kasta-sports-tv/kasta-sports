import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const BASE = "https://myfootball.pw";

// Headers які ти просив
const CUSTOM_HEADERS = {
  "origin": "https://myfootball.pw",
  "referer": "https://myfootball.pw/",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36"
};

const CACHE_TTL = 5 * 60 * 1000; // 5 хв
let cachedPlaylist = null;
let cacheTimestamp = null;

export const config = {
  runtime: "nodejs",
  maxDuration: 60
};

export default async function handler(req, res) {
  try {

    if (cachedPlaylist && Date.now() - cacheTimestamp < CACHE_TTL) {
      return res.status(200)
        .setHeader("Content-Type", "application/vnd.apple.mpegurl")
        .send(cachedPlaylist);
    }

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders(CUSTOM_HEADERS);

    console.log("[*] Opening main page...");
    await page.goto(BASE, { waitUntil: "domcontentloaded" });

    // Беремо тільки сторінки матчів
    const matchLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("a"))
        .map(a => a.href)
        .filter(h => h.includes("smotret-onlayn.html"));
    });

    const streams = [];

    for (const link of [...new Set(matchLinks)]) {

      const matchPage = await browser.newPage();
      await matchPage.setExtraHTTPHeaders(CUSTOM_HEADERS);

      let foundStream = null;

      matchPage.on("response", response => {
        const url = response.url();
        if (url.includes(".m3u8") && url.includes("expires=")) {
          foundStream = url;
        }
      });

      try {
        console.log("[*] Opening match:", link);

        await matchPage.goto(link, {
          waitUntil: "networkidle2",
          timeout: 30000
        });

        // даємо час плеєру стартанути
        await new Promise(r => setTimeout(r, 5000));

        if (foundStream) {
          const title = link.split("/").pop()
            .replace(".html", "")
            .replace(/-/g, " ");

          streams.push({
            title,
            url: foundStream
          });
        }

      } catch (err) {
        console.log("Error:", err.message);
      }

      await matchPage.close();
    }

    await browser.close();

    if (streams.length === 0) {
      return res.status(200)
        .setHeader("Content-Type", "application/vnd.apple.mpegurl")
        .send("#EXTM3U\n# No live matches found");
    }

    // Формуємо M3U
    let m3u = "#EXTM3U\n\n";

    for (const s of streams) {
      m3u += `#EXTINF:-1 group-title="MyFootball",${s.title}\n`;
      m3u += `#EXTVLCOPT:http-user-agent=${CUSTOM_HEADERS["user-agent"]}\n`;
      m3u += `#EXTVLCOPT:http-referrer=${CUSTOM_HEADERS["referer"]}\n`;
      m3u += `${s.url}\n\n`;
    }

    cachedPlaylist = m3u;
    cacheTimestamp = Date.now();

    console.log(`[+] Generated ${streams.length} streams`);

    res.status(200)
      .setHeader("Content-Type", "application/vnd.apple.mpegurl")
      .setHeader("Cache-Control", "public, max-age=60")
      .send(m3u);

  } catch (error) {
    console.error("[!] ERROR:", error.message);
    res.status(500).send("Error generating playlist");
  }
}
