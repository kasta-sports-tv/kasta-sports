export default async function handler(req, res) {
  try {
    const response = await fetch("https://myfootball.pw/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
        "Referer": "https://myfootball.pw/",
        "Origin": "https://myfootball.pw"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

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
    res.status(500).send(`Error: ${error.message}`);
  }
}
