import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export const config = {
  runtime: "nodejs",
  maxDuration: 120 // Збільшила час на 2 хв для скролу
};

let cachedPlaylist = null;
let lastUpdate = 0;
const CACHE_TIME = 10 * 60 * 1000; // 10 хв

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

    // Відкриваємо головну
    await page.goto("https://myfootball.pw/", { waitUntil: "networkidle0", timeout: 60000 });

    // Чекаємо H2 та блоків трансляцій
    await page.waitForSelector("#main_h2", { timeout: 15000 });
    await page.waitForSelector(".rewievs_tab1 a[href*='smotret-onlayn.html']", { timeout: 15000 });

    // 🔹 Автоскрол до кінця сторінки, щоб підвантажились всі матчі
    await autoScroll(page);

    // 2️⃣ Беремо всі посилання після H2 "ФУТБОЛЬНЫЕ ТРАНСЛЯЦИИ"
    const matchLinks = await page.evaluate(() => {
      const links = [];
      const h2 = document.querySelector("#main_h2");
      if (!h2) return links;

      const container = h2.closest("#main-body-bg");
      if (!container) return links;

      container.querySelectorAll(".rewievs_tab1 a[href*='smotret-onlayn.html']")
        .forEach(a => {
          if (a.href) links.push(a.href);
        });

      return links;
    });

    let playlist = "#EXTM3U\n\n";

    // 3️⃣ Проходимо по кожному матчу
    for (const link of matchLinks) {
      try {
        await page.goto(link, { waitUntil: "networkidle0", timeout: 60000 });
        await page.waitForTimeout(3000);

        const html = await page.content();
        const matches = [...html.matchAll(/https?:\/\/[^"'\\s]+\.m3u8[^"'\\s]*/g)];
        if (matches.length === 0) continue;

        for (let i = 0; i < matches.length; i++) {
          const streamUrl = matches[i][0];
          const baseTitle = link.split("/").pop().replace(".html", "");
          const title = matches.length > 1 ? `${baseTitle} [${i + 1}]` : baseTitle;

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

// 🔹 Функція автоскролу
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 200;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if(totalHeight >= scrollHeight){
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}
