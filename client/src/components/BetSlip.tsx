import { Selection, BetSlip as BetSlipType } from "@shared/schema";
import { computeTotalOdds, checkIsComboBonus, getComboBonus, countH2HGames } from "@shared/oddsUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Trash2, Receipt, CheckCircle2, Copy, QrCode, Share2, MessageCircle, AlertTriangle, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { translateMarket, formatOutcome } from "@/lib/marketLabels";
import { fmtOdds, roundOdds } from "@/lib/formatOdds";

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
}

interface BetSlipProps {
  selections: Selection[];
  onRemoveSelection: (selectionId: string) => void;
  onClearAll: () => void;
  onClose: () => void;
  onPlaceBet: (stake: number) => void;
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
  const { toast } = useToast();

  const { data: limits } = useQuery<LimitsData>({ queryKey: ["/api/limits"] });

  const MAX_BET_PAYOUT = limits?.maxBetPayout ?? 15000;

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
      const gameLabel = `${sel.homeTeam} vs ${sel.awayTeam}`;
      if (!grouped[gameLabel]) grouped[gameLabel] = [];
      grouped[gameLabel].push(sel);
    }
    const isCombo = checkIsComboBonus(bet.selections);
    const totalBetGames = isCombo ? new Set(bet.selections.map(s => s.gameId)).size : 0;
    const comboCount = isCombo ? countH2HGames(bet.selections) : 0;
    const comboPct = getComboBonus(totalBetGames);
    const baseReturn = isCombo
      ? bet.stake * bet.selections.reduce((acc, s) => acc * (s.originalOdds ?? s.odds), 1)
      : 0;
    const bonusPctStr = (comboPct * 100) % 1 === 0
      ? `${(comboPct * 100).toFixed(0)}%`
      : `${(comboPct * 100).toFixed(1)}%`;

    let lines = [`🎯 Bilhete FW Sports\n`];
    for (const [game, sels] of Object.entries(grouped)) {
      lines.push(`⚽ ${game}`);
      for (const s of sels) {
        lines.push(`  • ${translateMarket(s.marketKey)}: ${s.outcome} @${fmtOdds(s.odds)}`);
      }
      lines.push("");
    }
    lines.push(`📊 Odds Total: ${fmtOdds(bet.totalOdds)}`);
    lines.push(`💰 Apostado: R$ ${bet.stake.toFixed(2)}`);
    if (isCombo && comboPct > 0) {
      lines.push(`⚡ BÔNUS COMBINADA +${bonusPctStr} (${comboCount} jogos 1X2)`);
      lines.push(`  Sem bônus: R$ ${baseReturn.toFixed(2)}`);
      lines.push(`  Com bônus: R$ ${bet.potentialWin.toFixed(2)}`);
    }
    lines.push(`🏆 Retorno: R$ ${bet.potentialWin.toFixed(2)}`);
    lines.push(`📋 ID: #${bet.id.slice(0, 8).toUpperCase()}`);
    lines.push(`📅 Data: ${format(new Date(bet.createdAt), "dd/MM • HH:mm", { locale: ptBR })}`);
    if (includePixCode && bet.pixCode) {
      lines.push(`\n📱 Código PIX:\n${bet.pixCode}`);
    }
    if (includeFooter) {
      lines.push(`\n📱 FW SPORTS`);
      lines.push(`Caso sua aposta seja vencedora, entraremos em contato para informar o pagamento. Boa sorte!`);
    }
    return lines;
  };

  const shareBet = async () => {
    if (!placedBet) return;
    const shareText = buildShareLines(placedBet, true, false).join("\n");
    if (navigator.share) {
      try {
        await navigator.share({ title: "Bilhete FW Sports", text: shareText });
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
        await navigator.share({ title: "Bilhete FW Sports", text: shareText });
      } catch (err) {}
    } else {
      navigator.clipboard.writeText(shareText);
      toast({ title: "Bilhete copiado!", description: "Cole onde quiser para compartilhar." });
    }
  };
  
  const totalOdds = roundOdds(computeTotalOdds(selections));
  const stakeNum = parseFloat(stake || "0");

  const comboApplies = checkIsComboBonus(selections);
  const totalDistinctGames = comboApplies ? new Set(selections.map(s => s.gameId)).size : 0;
  const comboGameCount = countH2HGames(selections);
  const comboBonusPct = getComboBonus(totalDistinctGames);
  const baseOddsForBonus = comboApplies
    ? selections.reduce((acc, s) => acc * (s.originalOdds ?? s.odds), 1)
    : 0;
  const returnWithoutBonus = stakeNum * baseOddsForBonus;
  const returnWithBonus = Math.min(returnWithoutBonus * (1 + comboBonusPct), MAX_BET_PAYOUT);

  const rawPotentialWin = comboApplies ? returnWithBonus : stakeNum * totalOdds;
  const displayPotentialWin = Math.min(rawPotentialWin, MAX_BET_PAYOUT);
  const isCappedAtMax = comboApplies
    ? returnWithoutBonus * (1 + comboBonusPct) > MAX_BET_PAYOUT
    : stakeNum * totalOdds > MAX_BET_PAYOUT;

  const isNearDailyLimit = limits && displayPotentialWin > limits.dailyRemaining && limits.dailyRemaining > 0;
  const isDailyLimitReached = limits?.isDailyLimitReached ?? false;
  
  const handlePlaceBet = () => {
    const stakeValue = parseFloat(stake);
    if (stakeValue > 0 && selections.length > 0) {
      onPlaceBet(stakeValue);
    }
  };

  if (placedBet) {
    return (
      <>
        <div className="fixed inset-0 bg-black/50 z-[9998] md:hidden" onClick={onClose} />
        <Card className="fixed bottom-0 left-0 right-0 h-[92vh] rounded-t-2xl md:rounded-lg md:bottom-4 md:left-auto md:right-4 md:top-20 md:w-96 md:h-auto z-[9999] flex flex-col shadow-xl">
          <div className="flex justify-center pt-2 pb-1 md:hidden flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
        <CardHeader className="border-b border-card-border flex-shrink-0">
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
          <CardContent className="p-4">
            <div className="bg-primary/10 border border-primary rounded-md p-4 mb-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Código do Bilhete</p>
                <p className="font-mono text-lg font-bold text-primary" data-testid="text-bet-id">
                  #{placedBet.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>

            {placedBet.cappedAtMax && (
              <div className="bg-yellow-500/10 border border-yellow-500 rounded-md p-3 mb-4 flex items-start gap-2" data-testid="alert-capped-max">
                <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-700 dark:text-yellow-400">Os ganhos se limitam a R$15.000,00</p>
              </div>
            )}

            {placedBet.cappedByDaily && (
              <div className="bg-orange-500/10 border border-orange-500 rounded-md p-3 mb-4 flex items-start gap-2" data-testid="alert-capped-daily">
                <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-orange-700 dark:text-orange-400">
                  Ganhos limitados ao valor restante do limite diário: R$ {placedBet.potentialWin.toFixed(2)}
                </p>
              </div>
            )}

            {placedBet.pixQrCode && (
              <div className="bg-white rounded-md p-4 mb-4">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <QrCode className="w-5 h-5 text-primary" />
                  <p className="font-medium text-black">Pague com PIX</p>
                </div>
                <div className="flex justify-center mb-3">
                  <img 
                    src={placedBet.pixQrCode} 
                    alt="QR Code PIX" 
                    className="w-48 h-48"
                    data-testid="img-pix-qrcode"
                  />
                </div>
                <div className="text-center mb-3">
                  <p className="text-2xl font-bold text-primary">
                    R$ {placedBet.stake.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500">FW Sports</p>
                </div>
                <div className="flex justify-center">
                  <Button 
                    className="text-white font-bold"
                    style={{ background: "linear-gradient(135deg, #1e90ff 0%, #1565c0 50%, #0d47a1 100%)" }}
                    onClick={copyPixCode}
                    data-testid="button-copy-pix"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copiar PIX
                  </Button>
                </div>
                
                {(() => {
                  const displayOdds = roundOdds(computeTotalOdds(placedBet.selections));
                  const potentialPayout = Math.min(Math.round(placedBet.stake * displayOdds * 100) / 100, MAX_BET_PAYOUT);
                  const betDate = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
                  const lines: string[] = [
                    `*FW Sports - Comprovante de Aposta*`,
                    ``,
                    `Bilhete: *${placedBet.id.slice(0, 8).toUpperCase()}*`,
                    `Data: ${betDate}`,
                    `Valor apostado: *R$ ${placedBet.stake.toFixed(2).replace(".", ",")}*`,
                    `Odds totais: *${fmtOdds(displayOdds)}*`,
                    `Retorno potencial: *R$ ${potentialPayout.toFixed(2).replace(".", ",")}*`,
                    ``,
                    `*Selecoes:*`,
                    ...placedBet.selections.map((s, i) => [
                      `${i + 1}. ${s.homeTeam} x ${s.awayTeam}`,
                      `   ${translateMarket(s.marketKey)}: ${formatOutcome(s.outcome, s.marketKey)} | Odd: ${fmtOdds(s.odds)}`,
                    ]).flat(),
                    ``,
                    `Segue o comprovante do pagamento PIX em anexo.`,
                  ];
                  const waText = encodeURIComponent(lines.join("\n"));
                  return (
                    <>
                      <a
                        href={`https://wa.me/5592981128080?text=${waText}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mt-3"
                      >
                        <Button
                          className="w-full bg-[#25D366] text-white hover:bg-[#1ebe5d]"
                          data-testid="button-whatsapp-comprovante"
                        >
                          <SiWhatsapp className="w-5 h-5 mr-2" />
                          Enviar Comprovante via WhatsApp
                        </Button>
                      </a>

                      <p className="text-center text-black mt-3 font-extrabold leading-tight" style={{ fontSize: "1.35rem" }}>
                        Clique para enviar o comprovante PIX<br />e ativar seu bilhete
                      </p>
                    </>
                  );
                })()}
              </div>
            )}
            
            {(() => {
              const grouped: Record<string, Selection[]> = {};
              for (const sel of placedBet.selections) {
                const key = sel.gameId;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(sel);
              }
              return (
                <div className="space-y-3">
                  {Object.entries(grouped).map(([gameId, sels]) => {
                    const first = sels[0];
                    const gameOdds = roundOdds(computeTotalOdds(sels));
                    return (
                      <div key={gameId} className="rounded-xl bg-muted border border-border overflow-hidden" data-testid={`card-game-${gameId}`}>
                        <div className="flex items-center justify-between px-4 py-3 bg-muted/60 border-b border-border">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-base">⚽</span>
                            <span className="font-semibold text-foreground text-sm truncate">
                              {first.homeTeam} vs {first.awayTeam}
                            </span>
                          </div>
                          <span className="text-yellow-400 font-bold text-sm flex-shrink-0 ml-2">
                            {fmtOdds(gameOdds)}
                          </span>
                        </div>

                        <div className="px-4 py-3">
                          <div className="relative pl-5">
                            <div
                              className="absolute left-[5px] top-[6px] w-[2px] bg-yellow-400"
                              style={{ height: sels.length > 1 ? `calc(100% - 12px)` : "0px" }}
                            />
                            {sels.map((sel, idx) => (
                              <div key={sel.id} className={idx > 0 ? "mt-4" : ""}>
                                <div className="flex items-center justify-between relative">
                                  <div>
                                    <div className="flex items-center gap-0 relative">
                                      <div className="absolute -left-5 w-3 h-3 rounded-full bg-yellow-400 border-2 border-muted z-10" />
                                      <span className="text-muted-foreground text-xs">{translateMarket(sel.marketKey)}</span>
                                    </div>
                                    <p className="text-foreground font-semibold text-sm mt-0.5">{formatOutcome(sel.outcome, sel.marketKey, sel.homeTeam, sel.awayTeam)}</p>
                                  </div>
                                  <span className="text-yellow-400 font-bold text-xs flex-shrink-0 ml-2">{fmtOdds(sel.odds)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <div className="mt-4 rounded-xl bg-muted border border-border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-muted-foreground text-sm">Odds total</span>
                <span className="text-foreground font-bold text-lg">{fmtOdds(placedBet.totalOdds)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                <span className="text-muted-foreground text-sm">Valor Apostado</span>
                <span className="text-foreground font-medium">R$ {placedBet.stake.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                <span className="text-muted-foreground text-sm">Retorno Potencial</span>
                <span className="text-yellow-400 font-bold" data-testid="text-potential-win">R$ {placedBet.potentialWin.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-muted-foreground/60 text-xs">
                  {format(new Date(placedBet.createdAt), "dd/MM • HH:mm", { locale: ptBR })}
                </span>
                <span className="text-muted-foreground/60 text-xs">
                  ID: {placedBet.id.slice(0, 10).toUpperCase()}
                </span>
              </div>
            </div>

            <Button
              className="w-full mt-4 bg-green-600 text-white hover:bg-green-700"
              onClick={shareBetSlip}
              data-testid="button-share-bet"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Compartilhar Bilhete
            </Button>

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
        <div className="mx-3 mb-3 rounded-2xl bg-card border border-card-border shadow-xl px-4 py-3 flex items-center justify-between cursor-pointer">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            <span className="font-bold text-sm">Bilhete de Apostas</span>
            {selections.length > 0 && (
              <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                {selections.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {selections.length > 0 && (
              <span className="text-sm font-mono font-bold text-primary">
                {fmtOdds(totalOdds)}x
              </span>
            )}
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="fixed inset-0 bg-black/50 z-[9998] md:hidden" onClick={onClose} />
    <Card className="fixed bottom-0 left-0 right-0 h-[92vh] rounded-t-2xl md:rounded-lg md:bottom-4 md:left-auto md:right-4 md:top-20 md:w-96 md:h-auto z-[9999] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
      <div
        className="flex flex-col items-center pt-2 pb-1 md:hidden flex-shrink-0 cursor-pointer active:opacity-70"
        onClick={() => onToggleMinimize(true)}
        data-testid="button-minimize-betslip"
      >
        <div className="w-10 h-1 rounded-full bg-muted-foreground/40" />
        <span className="text-[10px] text-muted-foreground/60 mt-0.5">minimizar</span>
      </div>
      <CardHeader className="border-b border-card-border flex-shrink-0">
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
            <Receipt className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">
              Seu bilhete está vazio
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Clique nas odds para adicionar seleções
            </p>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 -mx-4 px-4">
              {(() => {
                const grouped: Record<string, Selection[]> = {};
                for (const sel of selections) {
                  const key = sel.gameId;
                  if (!grouped[key]) grouped[key] = [];
                  grouped[key].push(sel);
                }
                return (
                  <div className="space-y-3">
                    {Object.entries(grouped).map(([gameId, sels]) => {
                      const first = sels[0];
                      const gameOdds = roundOdds(computeTotalOdds(sels));
                      return (
                        <div key={gameId} className="rounded-xl bg-muted border border-border overflow-hidden" data-testid={`card-pre-game-${gameId}`}>
                          <div className="flex items-center justify-between px-3 py-2.5 bg-muted/60 border-b border-border">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm">⚽</span>
                              <span className="font-semibold text-foreground text-sm truncate">
                                {first.homeTeam} vs {first.awayTeam}
                              </span>
                            </div>
                            <span className="text-yellow-400 font-bold text-sm flex-shrink-0 ml-2">
                              {fmtOdds(gameOdds)}
                            </span>
                          </div>
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
                                      <span className="text-muted-foreground text-xs">{translateMarket(sel.marketKey)}</span>
                                    </div>
                                    <p className="text-foreground font-semibold text-sm mt-0.5">{formatOutcome(sel.outcome, sel.marketKey, sel.homeTeam, sel.awayTeam)}</p>
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0 ml-2 mt-1">
                                    <span className="text-yellow-400 font-bold text-xs">{fmtOdds(sel.odds)}</span>
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
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </ScrollArea>
            
            <div className="mt-4 pt-4 border-t border-card-border space-y-4 flex-shrink-0">
              <div>
                <label className="text-sm font-medium mb-2 block">Valor da Aposta (R$)</label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  placeholder="0.00"
                  className="text-lg font-mono"
                  data-testid="input-stake"
                />
              </div>
              
              <div className="flex gap-2">
                {[10, 25, 50, 100].map((value) => (
                  <Button
                    key={value}
                    variant="outline"
                    size="sm"
                    onClick={() => setStake(value.toString())}
                    className="flex-1"
                    data-testid={`button-stake-${value}`}
                  >
                    R${value}
                  </Button>
                ))}
              </div>

              {isCappedAtMax && (
                <div className="bg-red-500/10 border border-red-500 rounded-md p-2 flex items-start gap-2" data-testid="alert-preview-capped-max">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 dark:text-red-400 font-semibold">Retorno potencial ultrapassa o limite de R$15.000,00. Reduza o valor apostado para continuar.</p>
                </div>
              )}

              {gameLimitRemaining != null && gameLimitRemaining > 0 && selections.length === 1 && (() => {
                const maxStake = Math.floor(gameLimitRemaining / totalOdds * 100) / 100;
                if (maxStake <= 0) return null;
                return (
                  <div className="bg-amber-500/10 border border-amber-500/50 rounded-md p-3 flex items-center gap-3" data-testid="alert-game-limit-suggestion">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-amber-300 font-semibold mb-0.5">Limite do jogo atingido</p>
                      <p className="text-xs text-amber-200/80">
                        Aposta máxima sugerida para este jogo:
                      </p>
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

              {isNearDailyLimit && !isCappedAtMax && (
                <div className="bg-orange-500/10 border border-orange-500 rounded-md p-2 flex items-start gap-2" data-testid="alert-preview-near-daily">
                  <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-orange-700 dark:text-orange-400">
                    Os ganhos máximos desta aposta são de R$ {limits!.dailyRemaining.toFixed(2)} (limite diário restante)
                  </p>
                </div>
              )}
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Seleções</span>
                  <span className="font-medium">{selections.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Odds Total</span>
                  <span className="font-medium">{fmtOdds(totalOdds)}</span>
                </div>

                {comboApplies && comboBonusPct > 0 && (
                  <div className="rounded-xl overflow-hidden border-2 border-yellow-400 shadow-lg shadow-yellow-500/20">
                    <div className="bg-gradient-to-r from-yellow-500 to-amber-400 px-3 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-black fill-black flex-shrink-0" />
                        <span className="text-black font-extrabold text-sm tracking-wide">BÔNUS COMBINADA</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-black/70 text-xs font-medium">{comboGameCount} jogos 1X2</span>
                        <span className="bg-black text-yellow-400 font-extrabold text-sm px-2 py-0.5 rounded-full">
                          +{(comboBonusPct * 100) % 1 === 0
                            ? `${(comboBonusPct * 100).toFixed(0)}%`
                            : `${(comboBonusPct * 100).toFixed(1)}%`}
                        </span>
                      </div>
                    </div>
                    <div className="bg-yellow-500/10 px-3 py-2.5 space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Sem bônus</span>
                        <span className="text-foreground font-medium line-through decoration-red-400/70">R$ {returnWithoutBonus.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center border-t border-yellow-500/40 pt-2">
                        <span className="text-yellow-400 font-bold text-sm flex items-center gap-1">
                          <Zap className="w-3.5 h-3.5 fill-yellow-400" /> Com bônus
                        </span>
                        <span className="text-yellow-300 font-extrabold text-base">R$ {returnWithBonus.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-between text-lg pt-2 border-t border-card-border">
                  <span className="font-medium">Retorno Potencial</span>
                  <span className={`font-bold ${comboApplies ? "text-yellow-400" : "text-primary"}`}>
                    R$ {displayPotentialWin.toFixed(2)}
                  </span>
                </div>
              </div>
              
              <Button 
                className="w-full" 
                size="lg"
                onClick={handlePlaceBet}
                disabled={isPlacing || selections.length === 0 || parseFloat(stake) <= 0 || isDailyLimitReached || isCappedAtMax}
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
