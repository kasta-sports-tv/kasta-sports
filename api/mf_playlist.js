import fetch from "node-fetch";

const BASE = "https://myfootball.pw";

const CUSTOM_HEADERS = {
  "origin": BASE,
  "referer": BASE + "/",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36"
};

const CACHE_TTL = 5 * 60 * 1000; // 5 хвилин
let cachedPlaylist = null;
let cacheTimestamp = null;

export default async function handler(req, res) {
  try {
    // Повертаємо кеш якщо ще дійсний
    if (cachedPlaylist && Date.now() - cacheTimestamp < CACHE_TTL) {
      return res
        .status(200)
        .setHeader("Content-Type", "application/vnd.apple.mpegurl")
        .send(cachedPlaylist);
    }

    console.log("[*] Fetching main page...");
    const mainResp = await fetch(BASE, { headers: CUSTOM_HEADERS });
    const html = await mainResp.text();

    // 🔥 ЛОВИМО ВІДНОСНІ І ПОВНІ ПОСИЛАННЯ на матчі
    const rawLinks = Array.from(
      html.matchAll(
        /href="(https?:\/\/myfootball\.pw\/\d+[^"]*smotret-onlayn\.html|\/\d+[^"]*smotret-onlayn\.html)"/gi
      )
    ).map(m => m[1]);

    const matchLinks = rawLinks
      .map(link => (link.startsWith("http") ? link : BASE + link))
      .filter((v, i, a) => a.indexOf(v) === i);

    console.log("[*] Found match pages:", matchLinks.length);

    const streams = [];

    for (const link of matchLinks) {
      try {
        console.log("[*] Checking match:", link);

        const matchResp = await fetch(link, { headers: CUSTOM_HEADERS });
        const matchHtml = await matchResp.text();

        // Шукаємо перше .m3u8 посилання
        const m3uMatch = matchHtml.match(
          /https?:\/\/[^"']+\.m3u8\?[^"']+/i
        );

        if (m3uMatch) {
          const title = link
            .split("/")
            .pop()
            .replace(".html", "")
            .replace(/-/g, " ");

          streams.push({
            title,
            url: m3uMatch[0]
          });

          console.log("[+] Found stream:", m3uMatch[0]);
        } else {
          console.log("[-] No stream found for", link);
        }
      } catch (err) {
        console.log("[!] Error fetching match page:", err.message);
      }
    }

    if (streams.length === 0) {
      return res
        .status(200)
        .setHeader("Content-Type", "application/vnd.apple.mpegurl")
        .send("#EXTM3U\n# No live matches found");
    }

    // Формуємо M3U плейлист
    let m3u = "#EXTM3U\n\n";

    for (const s of streams) {
      m3u += `#EXTINF:-1 group-title="MyFootball",${s.title}\n`;
      m3u += `#EXTVLCOPT:http-user-agent=${CUSTOM_HEADERS["user-agent"]}\n`;
      m3u += `#EXTVLCOPT:http-referrer=${CUSTOM_HEADERS["referer"]}\n`;
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
    return res
      .status(500)
      .send("Error generating playlist: " + error.message);
  }
}
