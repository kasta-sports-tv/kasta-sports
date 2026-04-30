import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const base = "http://94.156.59.233:8899/udp/239.10.2.";
const port = ":30000";

const start = 150;
const end = 200;

// кеш
let cache = "";
let lastUpdate = 0;

async function checkStream(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, { signal: controller.signal });

    clearTimeout(timeout);

    if (!res.ok) return false;

    const reader = res.body.getReader();

    // читаємо кілька шматків
    let total = 0;

    for (let i = 0; i < 3; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
    }

    return total > 2000; // якщо є дані — живий
  } catch {
    return false;
  }
}

app.get("/playlist", async (req, res) => {
  const now = Date.now();

  // кеш 60 сек
  if (cache && now - lastUpdate < 60000) {
    res.setHeader("Content-Type", "application/x-mpegURL");
    return res.send(cache);
  }

  let m3u = "#EXTM3U\n\n";
  const working = [];

  for (let i = start; i <= end; i++) {
    const url = `${base}${i}${port}`;
    const ok = await checkStream(url);

    if (ok) {
      console.log("OK:", url);
      working.push({ num: i, url });
    } else {
      console.log("BAD:", url);
    }
  }

  working.forEach((ch, i) => {
    m3u += `#EXTINF:-1,Channel ${ch.num}\n${ch.url}\n\n`;
  });

  cache = m3u;
  lastUpdate = now;

  res.setHeader("Content-Type", "application/x-mpegURL");
  res.send(m3u);
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
