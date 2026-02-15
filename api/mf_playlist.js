import fetch from "node-fetch";

const BASE = "https://myfootball.pw";

const CUSTOM_HEADERS = {
  "origin": BASE,
  "referer": BASE + "/",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36"
};

const CACHE_TTL = 5 * 60 * 1000;
let cachedPlaylist = null;
let cacheTimestamp = null;

export default async function handler(req, res) {
  try {

    if (cachedPlaylist && Date.now() - cacheTimestamp < CACHE_TTL) {
      return res
        .status(200)
        .setHeader("Content-Type", "application/vnd.apple.mpegurl")
        .send(cachedPlaylist);
    }

    console.log("[*] Fetching main page...");
    const mainResp = await fetch(BASE, { headers: CUSTOM_HEADERS });
    const html = await mainResp.text();

    // 🔥 DEBUG — дивимось що реально приходить
    console.log("===== MAIN PAGE HTML START =====");
    console.log(html.slice(0, 2000));
    console.log("===== MAIN PAGE HTML END =====");

    const rawLinks = Array.from(
      html.matchAll(/href="(\/\d+[^"]*smotret-onlayn\.html)"/gi)
    ).map(m => BASE + m[1]);

    const matchLinks = [...new Set(rawLinks)];

    console.log("[*] Found matches:", matchLinks.length);

    const streams = [];

    for (const link of matchLinks) {
      try {
        console.log("[*] Checking:", link);

        const matchResp = await fetch(link, { headers: CUSTOM_HEADERS });
        const matchHtml = await matchResp.text();

        // 🔥 DEBUG матчу
        console.log("===== MATCH PAGE START =====");
        console.log(matchHtml.slice(0, 2000));
        console.log("===== MATCH PAGE END =====");

        const m3uMatch = matchHtml.match(
          /sourceUrl\s*=\s*["'](https?:\/\/[^"']+\.m3u8\?[^"']+)["']/i
        );

        if (m3uMatch) {
          const title = link
            .split("/")
            .pop()
            .replace(".html", "")
            .replace(/-/g, " ");

          streams.push({
            title,
            url: m3uMatch[1]
          });

          console.log("[+] FOUND:", m3uMatch[1]);
        } else {
          console.log("[-] No sourceUrl found");
        }

      } catch (err) {
        console.log("[!] Error:", err.message);
      }
    }

    if (!streams.length) {
      return res
        .status(200)
        .setHeader("Content-Type", "application/vnd.apple.mpegurl")
        .send("#EXTM3U\n# No streams found");
    }

    let m3u = "#EXTM3U\n\n";

    for (const s of streams) {
      m3u += `#EXTINF:-1 group-title="MyFootball",${s.title}\n`;
      m3u += `#EXTVLCOPT:http-origin=${CUSTOM_HEADERS.origin}\n`;
      m3u += `#EXTVLCOPT:http-referrer=${CUSTOM_HEADERS.referer}\n`;
      m3u += `#EXTVLCOPT:http-user-agent=${CUSTOM_HEADERS["user-agent"]}\n`;
      m3u += `${s.url}\n\n`;
    }

    cachedPlaylist = m3u;
    cacheTimestamp = Date.now();

    return res
      .status(200)
      .setHeader("Content-Type", "application/vnd.apple.mpegurl")
      .setHeader("Cache-Control", "public, max-age=60")
      .send(m3u);

  } catch (error) {
    console.error("[!] ERROR:", error.message);
    return res.status(500).send("Error: " + error.message);
  }
}
