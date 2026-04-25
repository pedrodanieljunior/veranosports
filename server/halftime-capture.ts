import { storage } from "./storage";

const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";

function normalizeTeamName(name: string): string {
  return (name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function teamsMatchSimple(a: string, b: string): boolean {
  const n1 = normalizeTeamName(a);
  const n2 = normalizeTeamName(b);
  return n1.includes(n2) || n2.includes(n1);
}

export async function captureHalftimeStats(): Promise<void> {
  const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
  if (!API_FOOTBALL_KEY) return;

  const allBets = await storage.getAllBetSlips();
  const pendingBets = allBets.filter(bet => bet.status === "pending");

  const fixtureIdsNeeded = new Set<number>();
  for (const bet of pendingBets) {
    for (const sel of bet.selections) {
      const mk = (sel.marketKey ?? "").toLowerCase();
      if (mk.includes("corner") && mk.includes("first half")) {
        if (sel.gameId?.startsWith("api-football-")) {
          const fid = parseInt(sel.gameId.replace("api-football-", ""), 10);
          if (!isNaN(fid)) fixtureIdsNeeded.add(fid);
        }
      }
    }
  }

  if (fixtureIdsNeeded.size === 0) return;

  const alreadyCaptured = await storage.getFixtureHalftimeStatsBatch([...fixtureIdsNeeded]);
  const toCapture = [...fixtureIdsNeeded].filter(fid => !alreadyCaptured.has(fid));

  if (toCapture.length === 0) return;

  console.log(`[HalftimeCapture] Verificando ${toCapture.length} fixture(s) ao vivo para escanteios 1ºT`);

  for (const fid of toCapture) {
    try {
      const fixtureRes = await fetch(
        `${API_FOOTBALL_BASE}/fixtures?id=${fid}`,
        { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
      );
      if (!fixtureRes.ok) continue;
      const fixtureData = await fixtureRes.json();
      const fixture = fixtureData.response?.[0];
      if (!fixture) continue;

      const statusShort = fixture.fixture?.status?.short;

      if (statusShort !== "HT") {
        console.log(`[HalftimeCapture] Fixture ${fid}: status="${statusShort}", aguardando HT`);
        continue;
      }

      const statsRes = await fetch(
        `${API_FOOTBALL_BASE}/fixtures/statistics?fixture=${fid}`,
        { headers: { "x-apisports-key": API_FOOTBALL_KEY } }
      );
      if (!statsRes.ok) continue;
      const statsData = await statsRes.json();

      const homeTeamName = fixture.teams.home.name ?? "";
      let homeCorners = 0;
      let awayCorners = 0;

      for (const teamStat of statsData.response || []) {
        const cornerStat = (teamStat.statistics || []).find((s: any) => s.type === "Corner Kicks");
        if (cornerStat) {
          const val = parseInt(cornerStat.value) || 0;
          if (teamsMatchSimple(teamStat.team?.name ?? "", homeTeamName)) {
            homeCorners = val;
          } else {
            awayCorners = val;
          }
        }
      }

      await storage.upsertFixtureHalftimeStats(fid, homeCorners, awayCorners);
      console.log(`[HalftimeCapture] ✅ Fixture ${fid} (HT capturado): casa=${homeCorners}, fora=${awayCorners}`);
    } catch (e) {
      console.log(`[HalftimeCapture] Erro ao processar fixture ${fid}:`, e);
    }
  }
}
