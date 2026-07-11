import { Selection, BetSlip as BetSlipType } from "@shared/schema";
import { computeTotalOdds, checkIsComboBonus, getComboBonus } from "@shared/oddsUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Trash2, Receipt, CheckCircle2, Copy, QrCode, Share2, MessageCircle, AlertTriangle, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { translateMarket, formatOutcome } from "@/lib/marketLabels";
import { fmtOdds, roundOdds } from "@/lib/formatOdds";
import { useComboBonus } from "@/hooks/use-combo-bonus";

interface PlacedBetWithPix extends BetSlipType {
  pixCode?: string;
  pixQrCode?: string;
  cappedAtMax?: boolean;
  cappedByDaily?: boolean;
  dailyRemaining?: number;
}

interface LimitsData {
  dailyTotal: number;
  dailyLimit: number;
  dailyRemaining: number;
  maxBetPayout: number;
  maxSelections: number;
  isDailyLimitReached: boolean;
  caixaBalance: number;
}

interface BetSlipProps {
  selections: Selection[];
  onRemoveSelection: (selectionId: string) => void;
  onClearAll: () => void;
  onClose: () => void;
  onPlaceBet: (stake: number, useBonus: boolean) => void;
  placedBet: PlacedBetWithPix | null;
  isPlacing: boolean;
  isMinimized: boolean;
  onToggleMinimize: (val: boolean) => void;
  gameLimitRemaining?: number | null;
}

export function BetSlip({ 
  selections, 
  onRemoveSelection, 
  onClearAll, 
  onClose,
  onPlaceBet,
  placedBet,
  isPlacing,
  isMinimized,
  onToggleMinimize,
  gameLimitRemaining,
}: BetSlipProps) {
  const [stake, setStake] = useState<string>("10");
  const [expandedGames, setExpandedGames] = useState<Set<string>>(new Set());
  const toggleGameExpand = (gameId: string) => {
    setExpandedGames(prev => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      return next;
    });
  };
  const [useBonus, setUseBonus] = useState(false);
  const { toast } = useToast();
  const { fractionTable: comboBonusTable } = useComboBonus();

  const { data: limits } = useQuery<LimitsData>({ queryKey: ["/api/limits"] });

  const { data: copaCards = [] } = useQuery<any[]>({
    queryKey: ["/api/copa-world-cup-cards"],
    staleTime: 60_000,
  });
  const copaBetBadgeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of copaCards) {
      if (c.badge) m.set(`copa-card-${c.id}`, c.badge);
    }
    return m;
  }, [copaCards]);

  const MAX_BET_PAYOUT = limits?.maxBetPayout ?? 15000;

  // ── Live Correlation ─────────────────────────────────────────────────
  const LIVE_CORR_NORM_IDS = new Set([1, 8, 12, 5, 6]);
  const normLiveCorrId = (mk: string): number | null => {
    if (!mk.startsWith("live_m")) return null;
    const id = parseInt(mk.slice(6), 10);
    if (id === 25) return 5;
    return LIVE_CORR_NORM_IDS.has(id) ? id : null;
  };
  const isLiveCorrEligible = (mk: string) => normLiveCorrId(mk) !== null;
  const { data: corrMatrix } = useQuery<Record<string, number>>({
    queryKey: ["/api/live-correlation"],
    queryFn: () => fetch("/api/live-correlation").then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  // ── SGP (Same Game Parlay) ────────────────────────────────────────────
  const SGP_ELIGIBLE = useMemo(() => new Set([
    'h2h', 'match_winner', 'goals over/under', 'goals over/under - second half',
    'both teams score', 'both teams to score - second half', 'total - home', 'total - away',
    'first half winner', 'goals over/under first half', 'both teams score - first half',
  ]), []);
  const isSGPEligible = (mk: string) => SGP_ELIGIBLE.has(mk.toLowerCase());

  // Group selections by gameId (also used in rendering)
  const grouped = useMemo(() => {
    const g: Record<string, Selection[]> = {};
    for (const sel of selections) {
      if (!g[sel.gameId]) g[sel.gameId] = [];
      g[sel.gameId].push(sel);
    }
    return g;
  }, [selections]);

  // Games with 2+ SGP-eligible markets
  const sgpGames = useMemo(() => {
    return Object.entries(grouped)
      .filter(([, sels]) => sels.filter(s => isSGPEligible(s.marketKey)).length >= 2)
      .map(([gameId, sels]) => ({ gameId, sels }));
  }, [grouped]);

  // Fetch SGP correlated odd per eligible game
  const sgpQueries = useQueries({
    queries: sgpGames.map(({ gameId, sels }) => {
      const eligible = sels.filter(s => isSGPEligible(s.marketKey));
      const first = sels[0];
      const selJson = JSON.stringify(eligible.map(s => ({
        marketKey: s.marketKey,
        outcome: s.outcome,
        odds: s.odds,
        originalOdds: s.originalOdds,
      })));
      return {
        queryKey: ['sgp', gameId, selJson],
        queryFn: (): Promise<{ odd: number | null; error?: string }> =>
          fetch(`/api/football/sgp-odds?gameId=${encodeURIComponent(gameId)}&homeTeam=${encodeURIComponent(first.homeTeam)}&awayTeam=${encodeURIComponent(first.awayTeam)}&selections=${encodeURIComponent(selJson)}`)
            .then(r => r.json()),
        enabled: eligible.length >= 2,
        staleTime: 5 * 60 * 1000,
      };
    }),
  });

  // Map: gameId → correlated SGP odd
  const sgpOddsMap = useMemo(() => {
    const map = new Map<string, number>();
    sgpGames.forEach(({ gameId }, idx) => {
      const data = sgpQueries[idx]?.data;
      if (data?.odd) map.set(gameId, data.odd);
    });
    return map;
  }, [sgpGames, sgpQueries]);

  const hasSGPActive = sgpOddsMap.size > 0;
  const hasSGPCombination = sgpGames.length > 0;
  const sgpLoading = sgpQueries.some(q => q.isLoading);

  // Badge: qualquer jogo com 2+ mercados diferentes selecionados
  const hasMultiMarketSameGame = useMemo(() =>
    Object.values(grouped).some(sels => new Set(sels.map(s => s.marketKey)).size >= 2),
    [grouped]);

  // Detect games with a live correlated pair
  const hasLiveCorr = useMemo(() =>
    Object.values(grouped).some(sels =>
      sels.filter(s => isLiveCorrEligible(s.marketKey)).length === 2
    ),
    [grouped]
  );

  // Per-game contribution to total odds, respecting SGP, live correlation and h2h context
  const computeGameContrib = (gameId: string, sels: Selection[], isComboCtx: boolean): number => {
    // 1. SGP for pre-match markets
    const sgpOdd = sgpOddsMap.get(gameId);
    if (sgpOdd) {
      const eligible = sels.filter(s => isSGPEligible(s.marketKey));
      const nonEligible = sels.filter(s => !isSGPEligible(s.marketKey));
      if (eligible.length >= 2) {
        let contrib = sgpOdd;
        for (const sel of nonEligible) {
          const isH2H = sel.marketKey === 'h2h' || sel.marketKey === 'match_winner';
          contrib *= (isComboCtx && isH2H && sel.originalOdds) ? sel.originalOdds : sel.odds;
        }
        return contrib;
      }
    }
    // 2. Live correlation for ao-vivo markets
    const liveCorrSels = sels.filter(s => isLiveCorrEligible(s.marketKey));
    if (liveCorrSels.length === 2 && corrMatrix) {
      const idA = normLiveCorrId(liveCorrSels[0].marketKey)!;
      const idB = normLiveCorrId(liveCorrSels[1].marketKey)!;
      const pairKey = `${Math.min(idA, idB)}_${Math.max(idA, idB)}`;
      const coeff = corrMatrix[pairKey] ?? 1.0;
      const corrOdd = liveCorrSels[0].odds * liveCorrSels[1].odds * coeff;
      const nonCorr = sels.filter(s => !isLiveCorrEligible(s.marketKey));
      return nonCorr.reduce((acc, s) => acc * s.odds, corrOdd);
    }
    // 3. Fallback: naive product (h2h uses originalOdds in combo context)
    return sels.reduce((acc, s) => {
      const isH2H = s.marketKey === 'h2h' || s.marketKey === 'match_winner';
      return acc * ((isComboCtx && isH2H && s.originalOdds) ? s.originalOdds : s.odds);
    }, 1);
  };

  const copyPixCode = () => {
    if (placedBet?.pixCode) {
      navigator.clipboard.writeText(placedBet.pixCode);
      toast({
        title: "Código PIX copiado!",
        description: "Cole no seu app de pagamentos.",
      });
    }
  };

  const buildShareLines = (bet: typeof placedBet, includePixCode: boolean, includeFooter: boolean): string[] => {
    if (!bet) return [];
    const grouped: Record<string, Selection[]> = {};
    for (const sel of bet.selections) {
      const gameLabel = sel.awayTeam ? `${sel.homeTeam} vs ${sel.awayTeam}` : sel.homeTeam;
      if (!grouped[gameLabel]) grouped[gameLabel] = [];
      grouped[gameLabel].push(sel);
    }
    const isCombo = checkIsComboBonus(bet.selections);
    const distinctBetGames = new Set(bet.selections.map(s => s.gameId)).size;
    const comboPct = isCombo ? getComboBonus(distinctBetGames, comboBonusTable) : 0;
    const baseReturn = isCombo
      ? bet.stake * bet.selections.reduce((acc, s) => acc * (s.originalOdds ?? s.odds), 1)
      : 0;
    const bonusPctStr = (comboPct * 100) % 1 === 0
      ? `${(comboPct * 100).toFixed(0)}%`
      : `${(comboPct * 100).toFixed(1)}%`;

    let lines = [`🎯 Bilhete Verano Sports\n`];
    for (const [game, sels] of Object.entries(grouped)) {
      lines.push(`⚽ ${game}`);
      for (const s of sels) {
        lines.push(`  • ${translateMarket(s.marketKey)}: ${s.outcome}`);
      }
      lines.push("");
    }
    lines.push(`📊 Odds Total: ${fmtOdds(bet.totalOdds)}`);
    lines.push(`💰 Apostado: R$ ${bet.stake.toFixed(2)}`);
    const betIsSingleH2H = bet.selections.length === 1 &&
      (bet.selections[0].marketKey === "h2h" || bet.selections[0].marketKey === "match_winner");
    const betSel0 = bet.selections[0];
    const betSuperPct = (betIsSingleH2H && betSel0?.originalOdds && betSel0?.odds && betSel0.odds > betSel0.originalOdds)
      ? Math.round((betSel0.odds / betSel0.originalOdds - 1) * 100) : 0;
    const betBaseReturn = betIsSingleH2H && betSel0?.originalOdds
      ? bet.stake * betSel0.originalOdds : 0;
    if (betIsSingleH2H && betSuperPct > 0 && betBaseReturn > 0) {
      lines.push(`⚡ SUPER AUMENTADA +${betSuperPct}%`);
      lines.push(`  Odd normal: R$ ${betBaseReturn.toFixed(2)}`);
      lines.push(`  Super Aumentada: R$ ${bet.potentialWin.toFixed(2)}`);
    }
    if (isCombo && comboPct > 0) {
      lines.push(`⚡ BÔNUS COMBINADA +${bonusPctStr} (${distinctBetGames} jogos)`);
      lines.push(`  Sem bônus: R$ ${baseReturn.toFixed(2)}`);
      lines.push(`  Com bônus: R$ ${bet.potentialWin.toFixed(2)}`);
    }
    lines.push(`🏆 Retorno: R$ ${bet.potentialWin.toFixed(2)}`);
    lines.push(`📋 ID: #${bet.id.slice(0, 8).toUpperCase()}`);
    lines.push(`📅 Data: ${format(new Date(bet.createdAt), "dd/MM • HH:mm", { locale: ptBR })}`);
    if (includePixCode && bet.pixCode) {
      lines.push(`\n📱 Código PIX:\n${bet.pixCode}`);
    }
    return lines;
  };

  const shareBet = async () => {
    if (!placedBet) return;
    const shareText = buildShareLines(placedBet, true, false).join("\n");
    if (navigator.share) {
      try {
        await navigator.share({ title: "Bilhete Verano Sports", text: shareText });
      } catch (err) {}
    } else {
      navigator.clipboard.writeText(shareText);
      toast({ title: "Bilhete copiado!", description: "Cole onde quiser para compartilhar." });
    }
  };

  const shareBetSlip = async () => {
    if (!placedBet) return;
    const shareText = buildShareLines(placedBet, false, true).join("\n");
    if (navigator.share) {
      try {
        await navigator.share({ title: "Bilhete Verano Sports", text: shareText });
      } catch (err) {}
    } else {
      navigator.clipboard.writeText(shareText);
      toast({ title: "Bilhete copiado!", description: "Cole onde quiser para compartilhar." });
    }
  };
  
  const { user } = useAuth();

  const comboApplies = checkIsComboBonus(selections);
  const distinctGameCount = Object.keys(grouped).length;

  // Compute total odds: use correlated SGP/live-corr odds for eligible games, fallback otherwise
  const totalOdds = useMemo(() => {
    if (hasSGPActive || hasLiveCorr) {
      const isComboCtx = distinctGameCount > 1;
      let total = 1;
      for (const [gameId, sels] of Object.entries(grouped)) {
        total *= computeGameContrib(gameId, sels, isComboCtx);
      }
      return roundOdds(total);
    }
    return roundOdds(computeTotalOdds(selections));
  }, [hasSGPActive, hasLiveCorr, grouped, selections, sgpOddsMap, distinctGameCount, corrMatrix]);

  const comboBonusPct = comboApplies ? getComboBonus(distinctGameCount, comboBonusTable) : 0;
  const baseOddsForBonus = useMemo(() => {
    if (!comboApplies) return 0;
    if (hasSGPActive || hasLiveCorr) {
      let base = 1;
      for (const [gameId, sels] of Object.entries(grouped)) {
        base *= computeGameContrib(gameId, sels, true);
      }
      return base;
    }
    return selections.reduce((acc, s) => acc * (s.originalOdds ?? s.odds), 1);
  }, [comboApplies, hasSGPActive, hasLiveCorr, grouped, selections, sgpOddsMap, corrMatrix]);

  const stakeNum = parseFloat(stake || "0");
  const hasBonusBalance = (user?.bonusBalance ?? 0) > 0;
  const totalAvailableWithBonus = (user?.balance ?? 0) + (user?.bonusBalance ?? 0);
  const isInsufficientBalance = user !== null && stakeNum > 0 && (
    useBonus ? totalAvailableWithBonus < stakeNum : (user?.balance ?? 0) < stakeNum
  );

  const returnWithoutBonus = stakeNum * baseOddsForBonus;
  const returnWithBonus = Math.min(returnWithoutBonus * (1 + comboBonusPct), MAX_BET_PAYOUT);

  const isSingleH2H = selections.length === 1 &&
    (selections[0].marketKey === "h2h" || selections[0].marketKey === "match_winner");
  const liveSel0 = selections[0];
  const superAumentoPct = (isSingleH2H && liveSel0?.originalOdds && liveSel0?.odds && liveSel0.odds > liveSel0.originalOdds)
    ? Math.round((liveSel0.odds / liveSel0.originalOdds - 1) * 100) : 0;
  const superAumentoBaseReturn = isSingleH2H && liveSel0?.originalOdds
    ? stakeNum * liveSel0.originalOdds : 0;

  const rawPotentialWin = comboApplies ? returnWithBonus : stakeNum * totalOdds;
  const displayPotentialWin = Math.min(rawPotentialWin, MAX_BET_PAYOUT);

  // Retorno líquido: quando usar bônus, desconta a parte do bônus usada no stake
  const bonusUsedInBet = useBonus ? Math.min(user?.bonusBalance ?? 0, stakeNum) : 0;
  const netPotentialWin = Math.max(0, displayPotentialWin - bonusUsedInBet);

  const isCappedAtMax = comboApplies
    ? returnWithoutBonus * (1 + comboBonusPct) > MAX_BET_PAYOUT
    : stakeNum * totalOdds > MAX_BET_PAYOUT;

  const caixaBalance = limits?.caixaBalance ?? Infinity;
  const isNearCaixaLimit = limits != null && caixaBalance < Infinity && displayPotentialWin > caixaBalance && caixaBalance > 0;
  const isDailyLimitReached = (limits?.isDailyLimitReached ?? false) || (limits != null && caixaBalance <= 0);

  const maxSuggestedStake = totalOdds > 0 && caixaBalance < Infinity
    ? Math.floor(Math.min(caixaBalance / totalOdds, MAX_BET_PAYOUT / totalOdds) * 100) / 100
    : 0;
  
  const handlePlaceBet = () => {
    const stakeValue = parseFloat(stake);
    if (stakeValue > 0 && selections.length > 0) {
      onPlaceBet(stakeValue, useBonus);
    }
  };

  if (placedBet) {
    return (
      <>
        <div className="fixed inset-0 bg-black/50 z-[9998] md:hidden" onClick={onClose} />
        <Card className="fixed bottom-0 left-0 right-0 h-[92vh] rounded-t-2xl md:rounded-lg md:bottom-4 md:left-auto md:right-4 md:top-20 md:w-96 md:h-auto z-[9999] flex flex-col shadow-xl" style={{ background: "linear-gradient(to bottom, #ffffff, #93c5fd)", color: "#111827" }}>
          <div className="flex justify-center pt-2 pb-1 md:hidden flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-blue-300/60" />
          </div>
        <CardHeader className="border-b border-blue-200 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg">Bilhete Gerado!</CardTitle>
            </div>
            <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-betslip">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        
        <ScrollArea className="flex-1">
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-green-500" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">Bilhete registrado!</p>
                <p className="text-sm text-gray-500 mt-1">Sua aposta foi confirmada com sucesso.</p>
              </div>
              <div className="bg-primary/10 border border-primary rounded-lg px-6 py-3">
                <p className="text-xs text-gray-500 mb-1">Código do Bilhete</p>
                <p className="font-mono text-xl font-bold text-primary" data-testid="text-bet-id">
                  #{placedBet.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
              {placedBet.cappedAtMax && (
                <div className="bg-yellow-500/10 border border-yellow-500 rounded-md p-3 flex items-start gap-2 text-left w-full" data-testid="alert-capped-max">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-700 dark:text-yellow-400">Os ganhos se limitam a R$15.000,00</p>
                </div>
              )}
              {placedBet.cappedByDaily && (
                <div className="bg-orange-500/10 border border-orange-500 rounded-md p-3 flex items-start gap-2 text-left w-full" data-testid="alert-capped-daily">
                  <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-orange-700 dark:text-orange-400">
                    Ganhos ajustados ao saldo disponível: R$ {placedBet.potentialWin.toFixed(2).replace(".", ",")}
                  </p>
                </div>
              )}
            </div>

            <Button 
              className="w-full mt-2" 
              variant="outline"
              onClick={() => {
                onClearAll();
                onClose();
              }}
              data-testid="button-new-bet"
            >
              Fazer Nova Aposta
            </Button>
          </CardContent>
        </ScrollArea>
      </Card>
      </>
    );
  }

  if (isMinimized) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-[9999] md:hidden"
        style={{ pointerEvents: "auto" }}
        onClick={() => onToggleMinimize(false)}
        data-testid="betslip-minimized-bar"
      >
        <div className="mx-3 mb-3 rounded-2xl border border-blue-700 shadow-xl px-4 py-3 flex items-center justify-between cursor-pointer" style={{ background: "linear-gradient(to bottom, #1565C0, #0d47a1)" }}>
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-white" />
            <span className="font-bold text-sm text-white">Bilhete de Apostas</span>
            {selections.length > 0 && (
              <span className="bg-white text-blue-900 text-xs font-bold px-2 py-0.5 rounded-full">
                {selections.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {selections.length > 0 && (
              <span className="text-sm font-mono font-bold text-white">
                {fmtOdds(totalOdds)}x
              </span>
            )}
            <ChevronUp className="w-5 h-5 text-white/70" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="fixed inset-0 bg-black/50 z-[9998] md:hidden" onClick={onClose} />
    <Card className="fixed bottom-0 left-0 right-0 h-[92vh] rounded-t-2xl md:rounded-lg md:bottom-4 md:left-auto md:right-4 md:top-20 md:w-96 md:h-auto z-[9999] flex flex-col shadow-xl" style={{ background: "linear-gradient(to bottom, #ffffff, #93c5fd)", color: "#111827" }} onClick={(e) => e.stopPropagation()}>
      <div
        className="flex flex-col items-center pt-2 pb-1 md:hidden flex-shrink-0 cursor-pointer active:opacity-70"
        onClick={() => onToggleMinimize(true)}
        data-testid="button-minimize-betslip"
      >
        <div className="w-10 h-1 rounded-full bg-blue-300/60" />
        <span className="text-[10px] text-gray-500 mt-0.5">minimizar</span>
      </div>
      <CardHeader className="border-b border-blue-200 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Bilhete de Apostas</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {selections.length > 0 && (
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={onClearAll}
                className="text-destructive"
                data-testid="button-clear-all"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-betslip">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-hidden p-4 flex flex-col">
        {isDailyLimitReached ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
            <AlertTriangle className="w-16 h-16 text-destructive/50 mb-4" />
            <p className="text-destructive font-medium" data-testid="text-daily-limit-reached">
              Para assegurar os pagamentos das apostas já feitas, o painel retomará em algumas horas.
            </p>
          </div>
        ) : selections.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
            <Receipt className="w-16 h-16 text-gray-400 mb-4" />
            <p className="text-gray-500">
              Seu bilhete está vazio
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Clique nas odds para adicionar seleções
            </p>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 -mx-4 px-4">
              {(() => {
                return (
                  <div className="space-y-3">
                    {Object.entries(grouped).map(([gameId, sels]) => {
                      const first = sels[0];
                      const sgpOdd = sgpOddsMap.get(gameId);
                      const isSGPGame = !!sgpOdd && sels.filter(s => isSGPEligible(s.marketKey)).length >= 2;
                      const isLiveCorrGame = sels.filter(s => isLiveCorrEligible(s.marketKey)).length === 2 && !!corrMatrix;
                      const isSGPQueryLoading = sgpLoading && sgpGames.some(g => g.gameId === gameId);
                      const isComboCtx = distinctGameCount > 1;
                      const gameOdds = (isSGPGame || isLiveCorrGame)
                        ? roundOdds(computeGameContrib(gameId, sels, isComboCtx))
                        : roundOdds(computeTotalOdds(sels, isComboCtx));
                      const isMulti = sels.length >= 2;
                      const isExpanded = expandedGames.has(gameId);
                      const isCopaGrupoGame = sels.some(s => s.marketKey.startsWith("copa_grupo"));
                      const copaGroupBadge = isCopaGrupoGame ? copaBetBadgeMap.get(gameId) : undefined;
                      const betSlipGameLabel = copaGroupBadge
                        ? `${copaGroupBadge} — ${first.homeTeam}`
                        : first.homeTeam + (first.awayTeam ? ` vs ${first.awayTeam}` : "");
                      return (
                        <div key={gameId} className="rounded-xl bg-white/70 border border-blue-200 overflow-hidden" data-testid={`card-pre-game-${gameId}`}>
                          <div
                            className={`flex items-center justify-between px-3 py-2.5 bg-white/60 border-b border-blue-200 ${isMulti ? "cursor-pointer select-none active:opacity-70" : ""}`}
                            onClick={() => isMulti && toggleGameExpand(gameId)}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm">⚽</span>
                              <span className="font-semibold text-gray-900 text-sm truncate">
                                {betSlipGameLabel}
                              </span>
                              {isSGPGame && (
                                <span className="flex-shrink-0 text-[10px] font-extrabold bg-gradient-to-r from-purple-500 to-pink-500 text-white px-1.5 py-0.5 rounded-full tracking-wide" data-testid={`badge-sgp-${gameId}`}>
                                  SGP
                                </span>
                              )}
                              {isSGPQueryLoading && !isSGPGame && (
                                <span className="flex-shrink-0 w-3 h-3 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                              <span className={`font-bold text-sm ${isSGPGame ? "text-purple-700" : "text-amber-600"}`}>
                                {fmtOdds(gameOdds)}
                              </span>
                              {isMulti && (
                                isExpanded
                                  ? <ChevronUp className="w-4 h-4 text-gray-500" />
                                  : <ChevronDown className="w-4 h-4 text-gray-500" />
                              )}
                            </div>
                          </div>

                          {/* Collapsed preview */}
                          {isMulti && !isExpanded && (
                            <button
                              className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-white/80 transition-colors"
                              onClick={() => toggleGameExpand(gameId)}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
                                <span className="text-gray-500 text-xs truncate">
                                  {sels[0].marketKey.startsWith("copa_grupo")
                                    ? formatOutcome(sels[0].outcome, sels[0].marketKey, sels[0].homeTeam, sels[0].awayTeam)
                                    : `${translateMarket(sels[0].marketKey)} · ${formatOutcome(sels[0].outcome, sels[0].marketKey, sels[0].homeTeam, sels[0].awayTeam)}`}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-600/30 border border-purple-500/50 text-purple-300 leading-none tracking-wide">
                                  CA
                                </span>
                                <span className="text-xs text-gray-500">+{sels.length - 1} mais</span>
                              </div>
                            </button>
                          )}

                          {/* Expanded list */}
                          {(!isMulti || isExpanded) && (
                            <div className="px-3 py-2.5">
                              <div className="relative pl-5">
                                <div
                                  className="absolute left-[5px] top-[6px] w-[2px] bg-yellow-400"
                                  style={{ height: sels.length > 1 ? `calc(100% - 12px)` : "0px" }}
                                />
                                {sels.map((sel, idx) => (
                                  <div key={sel.id} className={`flex items-start justify-between ${idx > 0 ? "mt-3" : ""}`}>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-0 relative">
                                        <div className="absolute -left-5 w-3 h-3 rounded-full bg-yellow-400 border-2 border-muted z-10" />
                                        {!sel.marketKey.startsWith("copa_grupo") && (
                                          <span className="text-gray-500 text-xs">{translateMarket(sel.marketKey)}</span>
                                        )}
                                      </div>
                                      <p className="text-gray-900 font-semibold text-sm mt-0.5">{formatOutcome(sel.outcome, sel.marketKey, sel.homeTeam, sel.awayTeam)}</p>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0 ml-2 mt-1">
                                      <button
                                        onClick={() => onRemoveSelection(sel.id)}
                                        className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/40 transition-colors"
                                        data-testid={`button-remove-selection-${sel.id}`}
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </ScrollArea>

            {/* Fixed bottom: stats + banners + stake input + alerts + submit */}
            <div className="pt-3 border-t border-blue-200 space-y-3 flex-shrink-0">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Seleções</span>
                <span className="font-medium">{selections.length}</span>
              </div>
              <div className="flex justify-between text-sm -mt-2">
                <span className="text-gray-600">Odds Total</span>
                <span className="font-medium">{fmtOdds(totalOdds)}</span>
              </div>

              {isSingleH2H && superAumentoPct > 0 && superAumentoBaseReturn > 0 && (
                <div className="rounded-xl overflow-hidden border-2 border-yellow-400 shadow-lg shadow-yellow-500/20">
                  <div className="bg-gradient-to-r from-yellow-500 to-amber-400 px-3 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-black fill-black flex-shrink-0" />
                      <span className="text-black font-extrabold text-sm tracking-wide">SUPER AUMENTADA</span>
                    </div>
                    <span className="bg-black text-yellow-400 font-extrabold text-sm px-2 py-0.5 rounded-full">
                      +{superAumentoPct}%
                    </span>
                  </div>
                  <div className="bg-yellow-500/10 px-3 py-2.5 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Odd normal</span>
                      <span className="text-gray-800 font-medium line-through decoration-red-400/70">R$ {superAumentoBaseReturn.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-yellow-500/40 pt-2">
                      <span className="text-amber-700 font-bold text-sm flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 fill-amber-700" /> Super Aumentada
                      </span>
                      <span className="text-amber-700 font-extrabold text-base">R$ {displayPotentialWin.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {hasSGPCombination && (
                <div className="rounded-xl overflow-hidden border-2 border-purple-500 shadow-lg shadow-purple-500/20" data-testid="banner-sgp-active">
                  <div className="bg-gradient-to-r from-purple-600 to-pink-500 px-3 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-white fill-white flex-shrink-0" />
                      <span className="text-white font-extrabold text-sm tracking-wide">COMBINAÇÃO ESPECIAL</span>
                    </div>
                    <span className="bg-white/20 text-white font-extrabold text-xs px-2 py-0.5 rounded-full">
                      SGP
                    </span>
                  </div>
                  <div className="bg-purple-500/10 px-3 py-2 space-y-1">
                    {sgpLoading ? (
                      <p className="text-xs text-purple-700">Calculando odds correlacionadas...</p>
                    ) : hasSGPActive ? (
                      <p className="text-xs text-purple-700">Odds correlacionadas via Placar Exato — mais precisas que multiplicação simples.</p>
                    ) : (
                      <p className="text-xs text-purple-700">Mercados do mesmo jogo combinados com odds especiais.</p>
                    )}
                  </div>
                </div>
              )}


              {hasMultiMarketSameGame && !(comboApplies && comboBonusPct > 0) && (
                <div className="rounded-xl overflow-hidden border-2 border-purple-500 shadow-lg shadow-purple-500/20" data-testid="banner-best-odds">
                  <div className="bg-gradient-to-r from-purple-600 to-pink-500 px-3 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-white fill-white flex-shrink-0" />
                      <span className="text-white font-extrabold text-sm tracking-wide">Combinadas Especiais</span>
                    </div>
                  </div>
                  <div className="bg-purple-500/10 px-3 py-2">
                    <p className="text-xs text-purple-700">A Verano Sports oferece as maiores odds combinadas do mercado.</p>
                  </div>
                </div>
              )}

              {comboApplies && comboBonusPct > 0 && (
                <div className="rounded-xl overflow-hidden border-2 border-yellow-400 shadow-lg shadow-yellow-500/20">
                  <div className="bg-gradient-to-r from-yellow-500 to-amber-400 px-3 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-black fill-black flex-shrink-0" />
                      <span className="text-black font-extrabold text-sm tracking-wide">BÔNUS COMBINADA</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-black/70 text-xs font-medium">{distinctGameCount} jogos</span>
                      <span className="bg-black text-yellow-400 font-extrabold text-sm px-2 py-0.5 rounded-full">
                        +{(comboBonusPct * 100) % 1 === 0
                          ? `${(comboBonusPct * 100).toFixed(0)}%`
                          : `${(comboBonusPct * 100).toFixed(1)}%`}
                      </span>
                    </div>
                  </div>
                  <div className="bg-yellow-500/10 px-3 py-2.5 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Sem bônus</span>
                      <span className="text-gray-800 font-medium line-through decoration-red-400/70">R$ {returnWithoutBonus.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-yellow-500/40 pt-2">
                      <span className="text-amber-700 font-bold text-sm flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 fill-amber-700" /> Com bônus
                      </span>
                      <span className="text-amber-700 font-extrabold text-base">R$ {returnWithBonus.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-1 border-t border-blue-200">
                <div className="flex justify-between text-lg">
                  <span className="font-medium">Retorno Potencial</span>
                  <span className={`font-bold ${hasSGPCombination ? "text-purple-700" : comboApplies || isSingleH2H ? "text-amber-600" : "text-primary"}`}>
                    R$ {bonusUsedInBet > 0 ? netPotentialWin.toFixed(2) : displayPotentialWin.toFixed(2)}
                  </span>
                </div>
                {bonusUsedInBet > 0 && stakeNum > 0 && (
                  <p className="text-xs text-zinc-400 text-right mt-0.5">
                    R$ {displayPotentialWin.toFixed(2)} − R$ {bonusUsedInBet.toFixed(2)} bônus
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Valor da Aposta (R$)</label>
                <Input
                  type="number"
                  min="5"
                  step="0.01"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  placeholder="0.00"
                  className="text-lg font-mono border-blue-300 focus-visible:ring-blue-400"
                  style={{ background: "#ffffff", color: "#111827" }}
                  data-testid="input-stake"
                />
              </div>
              
              <div className="flex gap-2">
                {[10, 25, 50, 100].map((value) => (
                  <button
                    key={value}
                    onClick={() => setStake(value.toString())}
                    className="flex-1 py-1.5 rounded-md text-sm font-medium border border-blue-300 transition-colors hover:bg-blue-50"
                    style={{ background: "#ffffff", color: "#111827" }}
                    data-testid={`button-stake-${value}`}
                  >
                    R${value}
                  </button>
                ))}
              </div>

              {stakeNum > 0 && stakeNum < 5 && (
                <p className="text-xs text-red-500 font-semibold">Valor mínimo de aposta: R$ 5,00</p>
              )}

              {isCappedAtMax && (
                <div className="bg-red-500/10 border border-red-500 rounded-md p-2 flex items-start gap-2" data-testid="alert-preview-capped-max">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 dark:text-red-400 font-semibold">Retorno potencial ultrapassa o limite de R$15.000,00. Reduza o valor apostado para continuar.</p>
                </div>
              )}

              {gameLimitRemaining != null && gameLimitRemaining > 0 && selections.length === 1 && (() => {
                const maxPayout = Math.min(
                  MAX_BET_PAYOUT,
                  gameLimitRemaining,
                  limits?.caixaBalance != null ? limits.caixaBalance : Infinity
                );
                const maxStake = Math.floor(maxPayout / totalOdds * 100) / 100;
                if (maxStake <= 0) return null;
                return (
                  <div className="bg-amber-500/10 border border-amber-500/50 rounded-md p-3 flex items-center gap-3" data-testid="alert-game-limit-suggestion">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-amber-300 font-semibold mb-0.5">Limite do jogo atingido</p>
                      <p className="text-xs text-amber-200/80">Aposta máxima sugerida para este jogo:</p>
                      <p className="text-sm font-bold text-amber-300 mt-0.5">
                        R$ {maxStake.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-500/50 text-amber-300 hover:bg-amber-500/20 text-xs shrink-0"
                      onClick={() => setStake(maxStake.toFixed(2))}
                      data-testid="button-use-suggested-stake"
                    >
                      Usar
                    </Button>
                  </div>
                );
              })()}

              {isNearCaixaLimit && !isCappedAtMax && (
                <div className="bg-orange-500/10 border border-orange-500 rounded-md p-2 flex items-start gap-2" data-testid="alert-preview-near-daily">
                  <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1">
                    <p className="text-xs text-orange-700 dark:text-orange-400">
                      Os ganhos máximos desta aposta são de R$ {(limits?.caixaBalance ?? 0).toFixed(2).replace(".", ",")}
                    </p>
                    {maxSuggestedStake > 0 && (
                      <button
                        type="button"
                        onClick={() => setStake(maxSuggestedStake.toFixed(2))}
                        className="text-xs text-orange-600 dark:text-orange-300 underline text-left hover:text-orange-500"
                        data-testid="button-use-max-stake"
                      >
                        Usar valor máximo: R$ {maxSuggestedStake.toFixed(2).replace(".", ",")}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {hasBonusBalance && (
                <label className="flex items-center gap-2 cursor-pointer bg-green-900/70 border border-green-500/60 rounded-lg px-3 py-2 shadow-sm">
                  <input
                    type="checkbox"
                    checked={useBonus}
                    onChange={e => setUseBonus(e.target.checked)}
                    className="w-4 h-4 accent-yellow-400"
                    data-testid="checkbox-use-bonus"
                  />
                  <span className="text-sm text-green-200 font-semibold">
                    🎁 Usar bônus (R$ {(user?.bonusBalance ?? 0).toFixed(2).replace(".", ",")}
                    {stakeNum > (user?.bonusBalance ?? 0) && stakeNum > 0
                      ? <span className="text-zinc-300 font-normal"> + R$ {Math.max(0, stakeNum - (user?.bonusBalance ?? 0)).toFixed(2).replace(".", ",")} do saldo</span>
                      : null})
                  </span>
                </label>
              )}

              {isInsufficientBalance && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>
                    {useBonus
                      ? `Saldo insuficiente. Total disponível: R$ ${totalAvailableWithBonus.toFixed(2).replace(".", ",")}`
                      : `Saldo insuficiente. Disponível: R$ ${(user?.balance ?? 0).toFixed(2).replace(".", ",")}`}
                  </span>
                </div>
              )}
              <Button 
                className="w-full" 
                size="lg"
                onClick={handlePlaceBet}
                disabled={isPlacing || selections.length === 0 || parseFloat(stake) < 5 || isDailyLimitReached || isCappedAtMax || isInsufficientBalance || isNearCaixaLimit}
                data-testid="button-place-bet"
              >
                {isPlacing ? "Gerando Bilhete..." : "Gerar Bilhete"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
    </>
  );
}
