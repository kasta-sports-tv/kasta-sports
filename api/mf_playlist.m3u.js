import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export const config = {
  runtime: "nodejs18.x",
  maxDuration: 60
};

export default async function handler(req, res) {
  let browser = null;

  try {
    const matchUrl = req.query.url;

    if (!matchUrl) {
      return res.status(400).send("Match URL missing");
    }

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();

    await page.goto(matchUrl, {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    // Чекаємо поки з’явиться sourceUrl
    await page.waitForFunction(() =>
      document.body.innerHTML.includes("sourceUrl"),
      { timeout: 20000 }
    );

    const html = await page.content();

    const match = html.match(/const\s+sourceUrl\s*=\s*"([^"]+)"/);

    if (!match) {
      throw new Error("sourceUrl not found");
    }

    const streamUrl = match[1];

    const playlist = `#EXTM3U

#EXTINF:-1,MyFootball
#EXTVLCOPT:http-origin=https://myfootball.pw
#EXTVLCOPT:http-referrer=https://myfootball.pw/
#EXTVLCOPT:http-user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)
${streamUrl}
`;

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.status(200).send(playlist);

  } catch (error) {
    res.status(500).send("Error: " + error.message);
  } finally {
    if (browser) await browser.close();
  }
}
