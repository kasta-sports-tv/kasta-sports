export default async function handler(req, res) {
  try {
    const response = await fetch("https://myfootball.pw/11528082-lacio-atalanta-pryamaya-translyaciya-italiya-seriya-a-14022026-smotret-onlayn.html", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://myfootball.pw/",
        "Origin": "https://myfootball.pw"
      }
    });

    const html = await response.text();

    res.setHeader("Content-Type", "text/plain");
    res.status(200).send(html.slice(0, 3000)); // покажемо перші 3000 символів
  } catch (err) {
    res.status(500).send("ERROR: " + err.message);
  }
}
