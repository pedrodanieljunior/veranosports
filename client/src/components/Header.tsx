import { History, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import logoFwSports from "@assets/logo_fw_sports_1771768422008.png";

interface HeaderProps {
  selectionsCount: number;
  betsCount: number;
  onOpenBetSlip: () => void;
  onOpenHistory: () => void;
}

export function Header({ selectionsCount, betsCount, onOpenBetSlip, onOpenHistory }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50" style={{ background: "linear-gradient(180deg, #f5c518 0%, #e8b206 40%, #d4960a 100%)" }}>
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center">
          <img 
            src={logoFwSports} 
            alt="FW Sports" 
            className="h-24 w-auto object-contain drop-shadow-lg" 
            data-testid="img-logo" 
          />
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenHistory}
            className="relative flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white/95 text-gray-800 font-bold text-sm shadow-md hover:bg-white transition-colors"
            data-testid="button-open-history"
          >
            <History className="w-4 h-4" />
            <span>Apostas</span>
            {betsCount > 0 && (
              <Badge 
                variant="secondary" 
                className="absolute -top-2 -right-2 h-5 min-w-5 flex items-center justify-center px-1.5 text-xs bg-red-500 text-white border-0"
                data-testid="badge-bets-count"
              >
                {betsCount}
              </Badge>
            )}
          </button>
          
          <button
            onClick={onOpenBetSlip}
            className="relative flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-600 text-white font-bold text-sm shadow-md hover:bg-green-700 transition-colors"
            data-testid="button-open-betslip"
          >
            <Receipt className="w-4 h-4" />
            <span>Bilhete</span>
            {selectionsCount > 0 && (
              <Badge 
                variant="secondary" 
                className="absolute -top-2 -right-2 h-5 min-w-5 flex items-center justify-center px-1.5 text-xs bg-red-500 text-white border-0"
                data-testid="badge-selections-count"
              >
                {selectionsCount}
              </Badge>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
