const SOFASCORE_BASE = "https://api.sofascore.com/api/v1";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "Referer": "https://www.sofascore.com/",
  "Origin": "https://www.sofascore.com",
};

export interface SofaScoreLeague {
  id: number;
  name: string;
  country: string;
  slug: string;
}

export interface SofaScoreEvent {
  id: number;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  leagueName: string;
}

export const popularLeagues: SofaScoreLeague[] = [
  { id: 17, name: "Premier League", country: "Inglaterra", slug: "premier-league" },
  { id: 8, name: "La Liga", country: "Espanha", slug: "laliga" },
  { id: 23, name: "Serie A", country: "Itália", slug: "serie-a" },
  { id: 35, name: "Bundesliga", country: "Alemanha", slug: "bundesliga" },
  { id: 34, name: "Ligue 1", country: "França", slug: "ligue-1" },
  { id: 325, name: "Brasileirão Série A", country: "Brasil", slug: "brasileirao-serie-a" },
  { id: 7, name: "Champions League", country: "Europa", slug: "uefa-champions-league" },
  { id: 679, name: "Europa League", country: "Europa", slug: "uefa-europa-league" },
  { id: 17015, name: "Conference League", country: "Europa", slug: "uefa-europa-conference-league" },
  { id: 384, name: "Copa Libertadores", country: "América do Sul", slug: "copa-libertadores" },
  { id: 238, name: "Primeira Liga", country: "Portugal", slug: "liga-portugal" },
  { id: 37, name: "Eredivisie", country: "Holanda", slug: "eredivisie" },
  { id: 155, name: "Liga Argentina", country: "Argentina", slug: "liga-profesional-argentina" },
  { id: 11621, name: "Liga MX", country: "México", slug: "liga-mx" },
  { id: 36, name: "Premiership", country: "Escócia", slug: "premiership" },
];

export async function fetchLeagueEvents(leagueId: number): Promise<SofaScoreEvent[]> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const url = `${SOFASCORE_BASE}/sport/football/scheduled-events/${today}`;
    
    const response = await fetch(url, { headers: HEADERS });
    
    if (!response.ok) {
      console.error("SofaScore events error:", response.status);
      return [];
    }
    
    const data = await response.json();
    const events = data.events || [];
    
    const leagueEvents = events.filter((event: any) => 
      event.tournament?.uniqueTournament?.id === leagueId
    );
    
    return leagueEvents.map((event: any) => ({
      id: event.id,
      homeTeam: event.homeTeam?.name || "Time Casa",
      awayTeam: event.awayTeam?.name || "Time Visitante",
      startTime: new Date(event.startTimestamp * 1000).toISOString(),
      homeOdds: 0,
      drawOdds: 0,
      awayOdds: 0,
      leagueName: event.tournament?.name || "Liga",
    }));
  } catch (error) {
    console.error("Error fetching SofaScore events:", error);
    return [];
  }
}

export async function fetchEventOdds(eventId: number): Promise<{ home: number; draw: number; away: number } | null> {
  try {
    const url = `${SOFASCORE_BASE}/event/${eventId}/odds/1/all`;
    
    const response = await fetch(url, { headers: HEADERS });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    const markets = data.markets || [];
    
    const fullTimeResult = markets.find((m: any) => m.marketName === "Full time" || m.marketId === 1);
    
    if (fullTimeResult && fullTimeResult.choices) {
      const homeChoice = fullTimeResult.choices.find((c: any) => c.name === "1" || c.name === "Home");
      const drawChoice = fullTimeResult.choices.find((c: any) => c.name === "X" || c.name === "Draw");
      const awayChoice = fullTimeResult.choices.find((c: any) => c.name === "2" || c.name === "Away");
      
      return {
        home: homeChoice?.fractionalValue ? parseOdds(homeChoice.fractionalValue) : 2.0,
        draw: drawChoice?.fractionalValue ? parseOdds(drawChoice.fractionalValue) : 3.2,
        away: awayChoice?.fractionalValue ? parseOdds(awayChoice.fractionalValue) : 3.5,
      };
    }
    
    return null;
  } catch (error) {
    console.error("Error fetching SofaScore odds:", error);
    return null;
  }
}

function parseOdds(fractionalValue: string): number {
  if (!fractionalValue) return 2.0;
  
  if (fractionalValue.includes("/")) {
    const [num, den] = fractionalValue.split("/").map(Number);
    return (num / den) + 1;
  }
  
  const parsed = parseFloat(fractionalValue);
  return isNaN(parsed) ? 2.0 : parsed;
}

export async function fetchUpcomingEvents(leagueId: number): Promise<SofaScoreEvent[]> {
  try {
    const league = popularLeagues.find(l => l.id === leagueId);
    if (!league) return [];
    
    const url = `${SOFASCORE_BASE}/unique-tournament/${leagueId}/season/61643/events/next/0`;
    
    const response = await fetch(url, { headers: HEADERS });
    
    if (!response.ok) {
      const todayUrl = `${SOFASCORE_BASE}/sport/football/scheduled-events/${new Date().toISOString().split("T")[0]}`;
      const todayResponse = await fetch(todayUrl, { headers: HEADERS });
      
      if (!todayResponse.ok) {
        return [];
      }
      
      const todayData = await todayResponse.json();
      const events = (todayData.events || []).filter((e: any) => 
        e.tournament?.uniqueTournament?.id === leagueId
      );
      
      return events.slice(0, 15).map((event: any) => ({
        id: event.id,
        homeTeam: event.homeTeam?.name || "Time Casa",
        awayTeam: event.awayTeam?.name || "Time Visitante", 
        startTime: new Date(event.startTimestamp * 1000).toISOString(),
        homeOdds: 0,
        drawOdds: 0,
        awayOdds: 0,
        leagueName: event.tournament?.name || league.name,
      }));
    }
    
    const data = await response.json();
    const events = data.events || [];
    
    return events.slice(0, 15).map((event: any) => ({
      id: event.id,
      homeTeam: event.homeTeam?.name || "Time Casa",
      awayTeam: event.awayTeam?.name || "Time Visitante",
      startTime: new Date(event.startTimestamp * 1000).toISOString(),
      homeOdds: 0,
      drawOdds: 0,
      awayOdds: 0,
      leagueName: event.tournament?.name || league.name,
    }));
  } catch (error) {
    console.error("Error fetching upcoming events:", error);
    return [];
  }
}
