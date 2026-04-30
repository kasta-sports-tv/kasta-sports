import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

const base = "http://94.156.59.233:8899/udp/239.10.2.";
const port = ":30000";

const start = 1;
const end = 200;

app.get("/playlist", (req, res) => {
  let m3u = "#EXTM3U\n\n";

  for (let i = start; i <= end; i++) {
    m3u += `#EXTINF:-1,Channel ${i}\n${base}${i}${port}\n\n`;
  }

  res.setHeader("Content-Type", "application/x-mpegURL");
  res.send(m3u);
});

app.listen(PORT, () => {
  console.log("API running on", PORT);
});
