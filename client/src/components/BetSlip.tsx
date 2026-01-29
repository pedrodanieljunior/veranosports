import { Selection, BetSlip as BetSlipType } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Trash2, Receipt, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";

interface BetSlipProps {
  selections: Selection[];
  onRemoveSelection: (selectionId: string) => void;
  onClearAll: () => void;
  onClose: () => void;
  onPlaceBet: (stake: number) => void;
  placedBet: BetSlipType | null;
  isPlacing: boolean;
}

export function BetSlip({ 
  selections, 
  onRemoveSelection, 
  onClearAll, 
  onClose,
  onPlaceBet,
  placedBet,
  isPlacing
}: BetSlipProps) {
  const [stake, setStake] = useState<string>("10");
  
  const totalOdds = selections.reduce((acc, sel) => acc * sel.odds, 1);
  const potentialWin = parseFloat(stake || "0") * totalOdds;
  
  const handlePlaceBet = () => {
    const stakeValue = parseFloat(stake);
    if (stakeValue > 0 && selections.length > 0) {
      onPlaceBet(stakeValue);
    }
  };

  if (placedBet) {
    return (
      <Card className="fixed right-4 bottom-4 top-20 w-96 max-w-[calc(100vw-2rem)] z-50 flex flex-col shadow-xl">
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
        
        <CardContent className="flex-1 overflow-hidden p-4">
          <div className="bg-primary/10 border border-primary rounded-md p-4 mb-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Código do Bilhete</p>
              <p className="font-mono text-lg font-bold text-primary" data-testid="text-bet-id">
                #{placedBet.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
          </div>
          
          <ScrollArea className="h-[calc(100%-180px)]">
            <div className="space-y-3">
              {placedBet.selections.map((selection) => (
                <div 
                  key={selection.id}
                  className="p-3 rounded-md bg-muted/50 border border-border"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">{selection.sportTitle}</p>
                      <p className="font-medium text-sm truncate">
                        {selection.homeTeam} vs {selection.awayTeam}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(selection.commenceTime), "dd/MM HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-primary font-medium">{selection.outcome}</p>
                      <p className="font-bold">{selection.odds.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          
          <div className="mt-4 pt-4 border-t border-card-border space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Valor Apostado</span>
              <span className="font-medium">R$ {placedBet.stake.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Odds Total</span>
              <span className="font-medium">{placedBet.totalOdds.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg pt-2 border-t border-card-border">
              <span className="font-medium">Retorno Potencial</span>
              <span className="font-bold text-primary" data-testid="text-potential-win">
                R$ {placedBet.potentialWin.toFixed(2)}
              </span>
            </div>
          </div>
          
          <Button 
            className="w-full mt-4" 
            onClick={() => {
              onClearAll();
              onClose();
            }}
            data-testid="button-new-bet"
          >
            Fazer Nova Aposta
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="fixed right-4 bottom-4 top-20 w-96 max-w-[calc(100vw-2rem)] z-50 flex flex-col shadow-xl">
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
        {selections.length === 0 ? (
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
              <div className="space-y-3">
                {selections.map((selection) => (
                  <div 
                    key={selection.id}
                    className="p-3 rounded-md bg-muted/50 border border-border relative group"
                  >
                    <button
                      onClick={() => onRemoveSelection(selection.id)}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`button-remove-selection-${selection.id}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                    
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">{selection.sportTitle}</p>
                        <p className="font-medium text-sm truncate">
                          {selection.homeTeam} vs {selection.awayTeam}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(selection.commenceTime), "dd/MM HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-primary font-medium">{selection.outcome}</p>
                        <p className="font-bold">{selection.odds.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Seleções</span>
                  <span className="font-medium">{selections.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Odds Total</span>
                  <span className="font-medium">{totalOdds.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg pt-2 border-t border-card-border">
                  <span className="font-medium">Retorno Potencial</span>
                  <span className="font-bold text-primary">
                    R$ {potentialWin.toFixed(2)}
                  </span>
                </div>
              </div>
              
              <Button 
                className="w-full" 
                size="lg"
                onClick={handlePlaceBet}
                disabled={isPlacing || selections.length === 0 || parseFloat(stake) <= 0}
                data-testid="button-place-bet"
              >
                {isPlacing ? "Gerando Bilhete..." : "Gerar Bilhete"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
