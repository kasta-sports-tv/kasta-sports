/**
 * api/playlist.js
 * Vercel serverless function to generate MyFootball M3U8 playlist on-the-fly
 */

const BASE = "https://myfootball.pw";

// VLC-style options (ТВОЇ ДАНІ)
const VLC_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36";
const VLC_REFERER = "https://myfootball.pw/";
const VLC_ORIGIN = "https://myfootball.pw";
const VLC_ICY = "1";

// Cache configuration (залишаємо як у PixelSport)
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes
let cachedData = null;
let cacheTimestamp = null;

/**
 * Fetch HTML page and extract stream links
 * Uses in-memory cache
 */
async function fetchStreams() {

  const now = Date.now();

  // Cache check
  if (cachedData && cacheTimestamp && (now - cacheTimestamp < CACHE_TTL)) {
    console.log("[*] Returning cached streams...");
    return cachedData;
  }

  console.log("[*] Fetching fresh HTML from myfootball...");

  const response = await fetch(BASE, {
    headers: {
      "User-Agent": VLC_USER_AGENT,
      "Referer": VLC_REFERER,
      "Origin": VLC_ORIGIN,
      "Accept": "text/html",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();

  // Regex для m3u8 з параметрами
  const regex = /https?:\/\/[^\s"'<>]+\.m3u8\?[^\s"'<>]+/gi;
  const matches = html.match(regex) || [];

  // Унікальні посилання
  const uniqueStreams = [...new Set(matches)];

  cachedData = uniqueStreams;
  cacheTimestamp = now;

  console.log(`[+] Found ${uniqueStreams.length} stream(s)`);

  return uniqueStreams;
}

/**
 * Generate M3U8 playlist text with headers based on player type
 */
function buildM3u(streams, playerType = 'vlc') {

  const lines = ["#EXTM3U"];

  for (let i = 0; i < streams.length; i++) {
    const link = streams[i];
    const title = `MyFootball Stream ${i + 1}`;

    lines.push(`#EXTINF:-1 group-title="LIVE",${title}`);

    switch (playerType.toLowerCase()) {

      case 'kodi':
        lines.push(`#KODIPROP:inputstream=inputstream.adaptive`);
        lines.push(`#KODIPROP:inputstream.adaptive.manifest_type=hls`);
        lines.push(`#KODIPROP:inputstream.adaptive.stream_headers=User-Agent=${encodeURIComponent(VLC_USER_AGENT)}&Referer=${encodeURIComponent(VLC_REFERER)}&Origin=${encodeURIComponent(VLC_ORIGIN)}`);
        lines.push(link);
        break;

      case 'tivimate':
        lines.push(`${link}|User-Agent=${VLC_USER_AGENT}|Referer=${VLC_REFERER}|Origin=${VLC_ORIGIN}`);
        break;

      case 'vlc':
      default:
        lines.push(`#EXTVLCOPT:http-user-agent=${VLC_USER_AGENT}`);
        lines.push(`#EXTVLCOPT:http-referrer=${VLC_REFERER}`);
        lines.push(`#EXTVLCOPT:http-origin=${VLC_ORIGIN}`);
        lines.push(`#EXTVLCOPT:http-icy-metadata=${VLC_ICY}`);
        lines.push(link);
        break;
    }
  }

  return lines.join("\n");
}

/**
 * Main Vercel serverless function handler
 * Query params:
 *   - type: 'vlc' (default), 'kodi', 'tivimate'
 *   - nocache: '1' to bypass cache
 */
export default async function handler(req, res) {
  try {

    const playerType = req.query.type || 'vlc';
    const validTypes = ['vlc', 'kodi', 'tivimate'];
    const finalPlayerType = validTypes.includes(playerType.toLowerCase())
      ? playerType.toLowerCase()
      : 'vlc';

    if (req.query.nocache === '1') {
      console.log("[*] Cache bypass requested");
      cachedData = null;
      cacheTimestamp = null;
    }

    console.log(`[*] Generating playlist (player: ${finalPlayerType})...`);

    const streams = await fetchStreams();

    if (streams.length === 0) {
      return res.status(200)
        .setHeader("Content-Type", "application/vnd.apple.mpegurl")
        .setHeader("Content-Disposition", 'attachment; filename="myfootball.m3u8"')
        .send("#EXTM3U\n# No streams currently available");
    }

    const playlist = buildM3u(streams, finalPlayerType);

    const cacheAge = cacheTimestamp
      ? Math.round((Date.now() - cacheTimestamp) / 1000)
      : 0;

    console.log(`[+] Playlist generated with ${streams.length} streams (cache age: ${cacheAge}s)`);

    res.status(200)
      .setHeader("Content-Type", "application/vnd.apple.mpegurl")
      .setHeader("Content-Disposition", 'attachment; filename="myfootball.m3u8"')
      .setHeader("Cache-Control", "public, max-age=60")
      .setHeader("X-Cache-Age", `${cacheAge}`)
      .setHeader("X-Player-Type", finalPlayerType)
      .send(playlist);

  } catch (error) {
    console.error(`[!] Error: ${error.message}`);

    res.status(500)
      .setHeader("Content-Type", "text/plain")
      .send(`Error generating playlist: ${error.message}`);
  }
}
