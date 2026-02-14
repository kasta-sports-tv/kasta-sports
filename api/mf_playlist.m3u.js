export default async function handler(req, res) {
  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
      "Referer": "https://myfootball.pw/",
      "Origin": "https://myfootball.pw"
    };

    // 1️⃣ Беремо головну сторінку
    const mainRes = await fetch("https://myfootball.pw/", { headers });
    if (!mainRes.ok) throw new Error(`Main page HTTP ${mainRes.status}`);
    const mainHtml = await mainRes.text();

    // 2️⃣ Знаходимо всі посилання на матчі
    const linkRegex = /href="\/(1\d+[^"]+?\.html)"/g;
    const matches = [...mainHtml.matchAll(linkRegex)];

    if (!matches.length) {
      throw new Error("No matches found");
    }

    let playlist = "#EXTM3U\n\n";

    // 3️⃣ Обходимо кожен матч
    for (let match of matches.slice(0, 10)) { // можна обмежити 10 для стабільності
      const matchPath = match[1];
      const matchUrl = `https://myfootball.pw/${matchPath}`;

      try {
        const matchRes = await fetch(matchUrl, { headers });
        if (!matchRes.ok) continue;

        const matchHtml = await matchRes.text();

        const streamMatch = matchHtml.match(/const\s+sourceUrl\s*=\s*"([^"]+)"/);
        if (!streamMatch) continue;

        const streamUrl = streamMatch[1];

        const title = matchPath
          .replace(".html", "")
          .replace(/-/g, " ");

        playlist += `#EXTINF:-1,${title}
#EXTVLCOPT:http-origin=https://myfootball.pw
#EXTVLCOPT:http-referrer=https://myfootball.pw/
#EXTVLCOPT:http-user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)
${streamUrl}

`;
      } catch (err) {
        continue;
      }
    }

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.status(200).send(playlist);

  } catch (error) {
    res.status(500).send(`Error: ${error.message}`);
  }
}
