let cache = null;
let lastUpdate = 0;

export default async function handler(req, res) {
  const now = Date.now();

  // кеш 60 секунд
  if (cache && now - lastUpdate < 60000) {
    res.setHeader("Content-Type", "application/x-mpegURL");
    return res.send(cache);
  }

  const base = "http://94.156.59.233:8899/udp/239.10.2.";
  const port = ":30000";

  const start = 150;
  const end = 200;

  let m3u = "#EXTM3U\n\n";

  async function fastCheck(url) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      return res.ok;
    } catch {
      return false;
    }
  }

  const results = [];

  // 🔥 перевіряємо не всі одразу, а батчами
  for (let i = start; i <= end; i += 5) {
    const batch = [];

    for (let j = i; j < i + 5 && j <= end; j++) {
      const url = `${base}${j}${port}`;
      batch.push(
        fastCheck(url).then(ok => (ok ? { num: j, url } : null))
      );
    }

    const checked = await Promise.all(batch);
    results.push(...checked.filter(Boolean));
  }

  results.forEach((ch, i) => {
    m3u += `#EXTINF:-1,Channel ${ch.num}\n${ch.url}\n\n`;
  });

  cache = m3u;
  lastUpdate = now;

  res.setHeader("Content-Type", "application/x-mpegURL");
  res.send(m3u);
}
