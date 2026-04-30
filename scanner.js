import fetch from "node-fetch";
import fs from "fs";

const base = "http://94.156.59.233:8899/udp/239.10.2.";
const port = ":30000";

const start = 1;
const end = 200;

function check(url) {
  return fetch(url, { timeout: 3000 })
    .then(r => r.ok)
    .catch(() => false);
}

const working = [];

for (let i = start; i <= end; i++) {
  const url = `${base}${i}${port}`;

  const ok = await check(url);

  console.log(ok ? "OK" : "BAD", url);

  if (ok) {
    working.push(url);
  }
}

let m3u = "#EXTM3U\n\n";

working.forEach((url, i) => {
  m3u += `#EXTINF:-1,Channel ${i + 1}\n${url}\n\n`;
});

fs.writeFileSync("filtered.m3u", m3u);

console.log("DONE:", working.length);
