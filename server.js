import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const base = "http://94.156.59.233:8899/udp/239.10.2.";
const port = ":30000";

const start = 1;
const end = 100;

let cache = "";
let lastUpdate = 0;

function checkStream(url) {
  return new Promise(async (resolve) => {
    try {
      const res = await fetch(url, { timeout: 5000 });

      if (!res.ok || !res.body) {
        return resolve(false);
      }

      let bytes = 0;

      const timer = setTimeout(() => {
        res.body.destroy();
        resolve(bytes > 2000);
      }, 3000);

      res.body.on("data", (chunk) => {
        bytes += chunk.length;

        if (bytes > 3000) {
          clearTimeout(timer);
          res.body.destroy();
          resolve(true);
        }
      });

      res.body.on("end", () => {
        clearTimeout(timer);
        resolve(bytes > 2000);
      });

      res.body.on("error", () => {
        clearTimeout(timer);
        resolve(false);
      });

    } catch {
      resolve(false);
    }
  });
}

app.get("/playlist", async (req, res) => {
  const now = Date.now();

  if (cache && now - lastUpdate < 60000) {
    res.setHeader("Content-Type", "application/x-mpegURL");
    return res.send(cache);
  }

  let m3u = "#EXTM3U\n\n";
  const working = [];

  for (let i = start; i <= end; i++) {
    const url = `${base}${i}${port}`;

    const ok = await checkStream(url);

    console.log(ok ? "OK" : "BAD", url);

    if (ok) {
      working.push({ num: i, url });
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
  console.log("Running on port", PORT);
});
