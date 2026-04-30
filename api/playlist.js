export default async function handler(req, res) {
  const base = "http://94.156.59.233:8899/udp/239.10.2.";
  const port = ":30000";

  let m3u = "#EXTM3U\n\n";

  const start = 1;
  const end = 300;

  const checks = await Promise.all(
    Array.from({ length: end - start + 1 }, async (_, i) => {
      const num = start + i;
      const url = `${base}${num}${port}`;

      try {
        const r = await fetch(url, { method: "GET" });
        if (r.status === 200) {
          return { num, url };
        }
      } catch (e) {}

      return null;
    })
  );

  const working = checks.filter(Boolean);

  working.forEach((ch, i) => {
    m3u += `#EXTINF:-1,Channel ${ch.num}\n${ch.url}\n\n`;
  });

  res.setHeader("Content-Type", "application/x-mpegURL");
  res.send(m3u);
}
