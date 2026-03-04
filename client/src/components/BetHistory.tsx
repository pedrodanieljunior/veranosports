import { BetSlip as BetSlipType } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, History, Receipt } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

interface BetHistoryProps {
  bets: BetSlipType[];
  isLoading: boolean;
  onClose: () => void;
}

export function BetHistory({ bets, isLoading, onClose }: BetHistoryProps) {
  return (
    <Card className="fixed right-4 bottom-4 top-20 w-96 max-w-[calc(100vw-2rem)] z-50 flex flex-col shadow-xl">
      <CardHeader className="border-b border-card-border flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Apostas</CardTitle>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-history">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-hidden p-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : bets.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
            <Receipt className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">
              Nenhum bilhete gerado ainda
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Selecione odds e gere seu primeiro bilhete
            </p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-3">
              {bets.map((bet) => (
                <div 
                  key={bet.id}
                  className="p-4 rounded-md bg-muted/50 border border-border"
                  data-testid={`bet-history-item-${bet.id}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="font-mono text-sm font-bold text-primary">
                        #{bet.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(bet.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Retorno</p>
                      <p className="font-bold text-primary">
                        R$ {bet.potentialWin.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-1 mb-3">
                    {bet.selections.slice(0, 2).map((selection) => (
                      <div key={selection.id} className="text-xs">
                        <span className="text-muted-foreground">
                          {selection.homeTeam} vs {selection.awayTeam}
                        </span>
                        <span className="ml-2 font-medium text-primary">
                          {selection.outcome} @ {selection.odds.toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {bet.selections.length > 2 && (
                      <p className="text-xs text-muted-foreground">
                        +{bet.selections.length - 2} mais seleções
                      </p>
                    )}
                  </div>
                  
                  <div className="flex justify-between text-xs pt-2 border-t border-border">
                    <span className="text-muted-foreground">
                      Aposta: R$ {bet.stake.toFixed(2)}
                    </span>
                    <span className="text-muted-foreground">
                      Odds: {bet.totalOdds.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
