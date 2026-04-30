export default async function handler(req, res) {
  const base = "http://94.156.59.233:8899/udp/239.10.2.";
  const port = ":30000";

  const start = 100;
  const end = 200;

  let m3u = "#EXTM3U\n\n";

  async function isStreamAlive(url) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) return false;

      const reader = response.body.getReader();

      // читаємо перший chunk
      const { value, done } = await reader.read();

      // якщо нічого не прийшло — мертвий
      if (done || !value || value.length < 500) {
        return false;
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  const results = await Promise.all(
    Array.from({ length: end - start + 1 }, async (_, i) => {
      const num = start + i;
      const url = `${base}${num}${port}`;

      const alive = await isStreamAlive(url);

      if (alive) {
        return { num, url };
      }

      return null;
    })
  );

  const working = results.filter(Boolean);

  working.forEach((ch, i) => {
    m3u += `#EXTINF:-1,Channel ${ch.num}\n${ch.url}\n\n`;
  });

  res.setHeader("Content-Type", "application/x-mpegURL");
  res.send(m3u);
}
