import { Trophy, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface HeaderProps {
  selectionsCount: number;
  onOpenBetSlip: () => void;
}

export function Header({ selectionsCount, onOpenBetSlip }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-card border-b border-card-border">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
            <Trophy className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">GANHE MAIS AQUI</h1>
            <p className="text-xs text-muted-foreground">Apostas Esportivas</p>
          </div>
        </div>
        
        <button
          onClick={onOpenBetSlip}
          className="relative flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover-elevate active-elevate-2"
          data-testid="button-open-betslip"
        >
          <Receipt className="w-5 h-5" />
          <span className="hidden sm:inline">Bilhete</span>
          {selectionsCount > 0 && (
            <Badge 
              variant="secondary" 
              className="absolute -top-2 -right-2 h-5 min-w-5 flex items-center justify-center px-1.5 text-xs bg-accent text-accent-foreground"
              data-testid="badge-selections-count"
            >
              {selectionsCount}
            </Badge>
          )}
        </button>
      </div>
    </header>
  );
}
