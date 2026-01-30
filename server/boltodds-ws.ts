import WebSocket from "ws";

const BOLTODDS_API_KEY = process.env.BOLTODDS_API_KEY;
const BOLTODDS_WS_URL = `wss://spro.agency/api?key=${BOLTODDS_API_KEY}`;

interface BoltOddsMarket {
  market: string;
  outcomes: Array<{
    name: string;
    price: number;
    point?: number;
    bookmaker?: string;
  }>;
}

interface BoltOddsGameData {
  game: string;
  markets: BoltOddsMarket[];
  lastUpdate: Date;
}

type OddsCallback = (data: BoltOddsGameData) => void;

class BoltOddsWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private subscriptions: Map<string, OddsCallback[]> = new Map();
  private gameData: Map<string, BoltOddsGameData> = new Map();
  private isConnected = false;
  private pendingSubscriptions: string[] = [];

  constructor() {
    if (BOLTODDS_API_KEY) {
      this.connect();
    } else {
      console.log("BoltOdds: API key not configured, WebSocket disabled");
    }
  }

  private connect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
    }

    console.log("BoltOdds WebSocket: Connecting...");
    this.ws = new WebSocket(BOLTODDS_WS_URL);

    this.ws.on("open", () => {
      console.log("BoltOdds WebSocket: Connected");
      this.isConnected = true;
      
      // Enviar subscrição inicial para todos os esportes de futebol
      this.sendInitialSubscription();
      
      if (this.pendingSubscriptions.length > 0) {
        this.sendSubscription(this.pendingSubscriptions);
        this.pendingSubscriptions = [];
      }
    });

    this.ws.on("message", (data: WebSocket.RawData) => {
      try {
        const rawData = data.toString();
        const message = JSON.parse(rawData);
        
        // Log estrutura da mensagem para debug
        const keys = Object.keys(message);
        if (keys.length > 0 && rawData.length > 100) {
          console.log(`BoltOdds WebSocket: Received ${rawData.length} bytes, keys: ${keys.slice(0, 5).join(', ')}`);
        }
        
        this.handleMessage(message);
      } catch (e) {
        console.error("BoltOdds WebSocket: Error parsing message", e);
      }
    });

    this.ws.on("close", () => {
      console.log("BoltOdds WebSocket: Disconnected, reconnecting in 5s...");
      this.isConnected = false;
      this.scheduleReconnect();
    });

    this.ws.on("error", (error) => {
      console.error("BoltOdds WebSocket: Error", error.message);
      this.isConnected = false;
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 5000);
  }

  private handleMessage(message: any) {
    // Ignorar ping e conexão
    if (message.action === "ping" || message.ping || message.action === "socket_connected") {
      return;
    }

    // BoltOdds envia dados como array
    const items = Array.isArray(message) ? message : [message];
    
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      
      // BoltOdds estrutura: { action: "line_update", data: {...} }
      const action = item.action;
      if (action !== "line_update" && action !== "initial_state") continue;
      
      const data = item.data;
      if (!data || typeof data !== 'object') continue;
      
      const gameKey = data.game;
      if (!gameKey) continue;
      
      // Processar outcomes para markets
      const outcomesData = data.outcomes;
      if (!outcomesData || typeof outcomesData !== 'object') continue;
      
      const markets: BoltOddsMarket[] = [];
      const sportsbook = data.sportsbook || "unknown";
      
      // Agrupar por tipo de mercado (outcome_name)
      const marketGroups = new Map<string, any[]>();
      
      // BoltOdds outcomes format: { "Team 3 Way": { odds: "+125", outcome_name: "3 Way", outcome_target: "Team", ... } }
      for (const [fullName, marketVal] of Object.entries(outcomesData)) {
        if (typeof marketVal !== 'object' || marketVal === null) continue;
        
        const mv = marketVal as any;
        const oddsStr = mv.odds as string;
        if (!oddsStr) continue;
        
        // Converter odds americanas para decimais
        const decimalOdds = this.americanToDecimal(oddsStr);
        if (decimalOdds <= 0) continue;
        
        const outcomeName = mv.outcome_name || "Unknown"; // "3 Way", "Spread", "Total", etc
        const outcomeTarget = mv.outcome_target || fullName; // "Team", "Over", "Under"
        const outcomeLine = mv.outcome_line; // Linha para spreads/totals
        
        // Determinar o nome do mercado e o outcome
        let marketType = outcomeName;
        if (outcomeLine !== null && outcomeLine !== undefined) {
          // Para spreads e totals, incluir a linha
          marketType = `${outcomeName} ${outcomeLine}`;
        }
        
        if (!marketGroups.has(marketType)) {
          marketGroups.set(marketType, []);
        }
        
        marketGroups.get(marketType)!.push({
          name: outcomeTarget,
          price: decimalOdds,
          point: outcomeLine,
          bookmaker: sportsbook
        });
      }
      
      // Converter grupos em mercados
      for (const [marketType, outcomes] of marketGroups.entries()) {
        markets.push({ market: marketType, outcomes });
      }

      if (markets.length > 0) {
        // Merge com dados existentes ou criar novo
        const existing = this.gameData.get(gameKey);
        if (existing) {
          // Merge markets
          for (const newMarket of markets) {
            const existingMarket = existing.markets.find(m => m.market === newMarket.market);
            if (existingMarket) {
              // Update outcomes from same bookmaker
              for (const newOutcome of newMarket.outcomes) {
                const idx = existingMarket.outcomes.findIndex(
                  o => o.name === newOutcome.name && o.bookmaker === newOutcome.bookmaker
                );
                if (idx >= 0) {
                  existingMarket.outcomes[idx] = newOutcome;
                } else {
                  existingMarket.outcomes.push(newOutcome);
                }
              }
            } else {
              existing.markets.push(newMarket);
            }
          }
          existing.lastUpdate = new Date();
        } else {
          this.gameData.set(gameKey, {
            game: gameKey,
            markets,
            lastUpdate: new Date()
          });
        }

        const callbacks = this.subscriptions.get(gameKey);
        if (callbacks) {
          const gameData = this.gameData.get(gameKey)!;
          callbacks.forEach(cb => cb(gameData));
        }
      }
    }
    
    // Log quantidade de jogos processados
    const gamesWithData = Array.from(this.gameData.entries()).filter(([k, v]) => v.markets.length > 0).length;
    if (gamesWithData > 0 && gamesWithData % 50 === 0) {
      console.log(`BoltOdds WebSocket: ${gamesWithData} games with odds data`);
    }
  }
  
  // Método para debug - listar jogos disponíveis
  getAvailableGames(): string[] {
    return Array.from(this.gameData.keys());
  }

  // Converter odds americanas para decimais
  private americanToDecimal(odds: string): number {
    try {
      // Remover espaços e caracteres não numéricos exceto + e -
      const cleaned = odds.replace(/[^\d+-]/g, '');
      const numericOdds = parseInt(cleaned, 10);
      
      if (isNaN(numericOdds)) return 0;
      
      if (numericOdds > 0) {
        // Odds positivas: +150 = 2.50
        return Number(((numericOdds / 100) + 1).toFixed(2));
      } else {
        // Odds negativas: -150 = 1.67
        return Number(((100 / Math.abs(numericOdds)) + 1).toFixed(2));
      }
    } catch {
      return 0;
    }
  }

  private soccerSports = [
    "EPL", "La Liga", "Serie A", "Bundesliga", "Ligue 1",
    "Champions League", "Europa League", "Europa Conference",
    "MLS", "Liga MX", "Primeira Liga", "Brazil Serie A",
    "FA Cup", "EFL Championship", "World Cup", "World Cup Quals"
  ];

  private sendInitialSubscription() {
    if (!this.ws || !this.isConnected) return;

    const subscribeMessage = {
      action: "subscribe",
      filters: {
        sports: this.soccerSports,
        markets: ["Moneyline", "Spread", "Total", "3 Way", "1st Half Moneyline", "1st Half Total", "BTTS", "Double Chance", "Draw No Bet"]
      }
    };

    try {
      this.ws.send(JSON.stringify(subscribeMessage));
      console.log("BoltOdds WebSocket: Sent initial subscription for all soccer sports");
    } catch (e) {
      console.error("BoltOdds WebSocket: Error sending initial subscription", e);
    }
  }

  private sendSubscription(games: string[]) {
    if (!this.ws || !this.isConnected) {
      this.pendingSubscriptions.push(...games);
      return;
    }

    const subscribeMessage = {
      action: "subscribe",
      filters: {
        sports: this.soccerSports,
        games: games.length > 0 ? games : undefined,
        markets: ["Moneyline", "Spread", "Total", "3 Way", "1st Half Moneyline", "1st Half Total", "BTTS", "Double Chance", "Draw No Bet"]
      }
    };

    try {
      this.ws.send(JSON.stringify(subscribeMessage));
      console.log(`BoltOdds WebSocket: Subscribed to ${games.length} games`);
    } catch (e) {
      console.error("BoltOdds WebSocket: Error sending subscription", e);
    }
  }

  subscribeToGame(gameKey: string, callback: OddsCallback) {
    if (!this.subscriptions.has(gameKey)) {
      this.subscriptions.set(gameKey, []);
      this.sendSubscription([gameKey]);
    }
    this.subscriptions.get(gameKey)!.push(callback);
  }

  getGameData(gameKey: string): BoltOddsGameData | undefined {
    return this.gameData.get(gameKey);
  }

  getAllGameData(): Map<string, BoltOddsGameData> {
    return this.gameData;
  }

  isActive(): boolean {
    return this.isConnected;
  }
}

export const boltOddsWS = new BoltOddsWebSocket();
