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
    <header className="sticky top-0 z-50" style={{ background: "linear-gradient(135deg, #f5c518 0%, #e6a800 50%, #d4960a 100%)" }}>
      <div className="container mx-auto px-4 h-20 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src={logoFwSports} alt="FW Sports" className="h-16 w-auto object-contain" data-testid="img-logo" />
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenHistory}
            className="relative flex items-center gap-2 px-4 py-2 rounded-lg bg-white/90 text-gray-800 font-semibold text-sm shadow-sm hover:bg-white transition-colors"
            data-testid="button-open-history"
          >
            <History className="w-4 h-4" />
            <span>Meus Bilhetes</span>
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
            className="relative flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white font-semibold text-sm shadow-sm hover:bg-green-700 transition-colors"
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
