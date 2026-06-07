import { History, Receipt, UserCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import veranoLogo from "@assets/verano-logo-transparent.png";

interface HeaderProps {
  selectionsCount: number;
  betsCount: number;
  onOpenBetSlip: () => void;
  onOpenHistory: () => void;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onOpenProfile: () => void;
}

export function Header({
  selectionsCount,
  betsCount,
  onOpenBetSlip,
  onOpenHistory,
  onOpenLogin,
  onOpenRegister,
  onOpenProfile,
}: HeaderProps) {
  const { user, loading } = useAuth();

  return (
    <header className="sticky top-0 z-50 overflow-hidden" style={{ background: "linear-gradient(135deg, #0d1629 0%, #0e1f4a 60%, #0d2a6e 100%)" }}>
      {/* Neon fan streaks overlay */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 400 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            {/* Focal point glow */}
            <radialGradient id="focal-h" cx="82%" cy="38%" r="25%">
              <stop offset="0%" stopColor="rgba(120,200,255,0.7)" />
              <stop offset="100%" stopColor="rgba(0,100,255,0)" />
            </radialGradient>
            {/* Streak gradients — all from focal (328,38) to endpoint */}
            <linearGradient id="sh1" x1="328" y1="38" x2="-20" y2="-20" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="rgba(160,220,255,0.95)" /><stop offset="100%" stopColor="rgba(80,160,255,0)" />
            </linearGradient>
            <linearGradient id="sh2" x1="328" y1="38" x2="60" y2="-15" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="rgba(140,210,255,0.85)" /><stop offset="100%" stopColor="rgba(60,140,255,0)" />
            </linearGradient>
            <linearGradient id="sh3" x1="328" y1="38" x2="170" y2="-18" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="rgba(180,230,255,0.9)" /><stop offset="100%" stopColor="rgba(80,160,255,0)" />
            </linearGradient>
            <linearGradient id="sh4" x1="328" y1="38" x2="-30" y2="55" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="rgba(100,190,255,0.8)" /><stop offset="100%" stopColor="rgba(40,120,255,0)" />
            </linearGradient>
            <linearGradient id="sh5" x1="328" y1="38" x2="-30" y2="100" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="rgba(80,170,255,0.7)" /><stop offset="100%" stopColor="rgba(30,100,255,0)" />
            </linearGradient>
            <linearGradient id="sh6" x1="328" y1="38" x2="60" y2="118" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="rgba(120,200,255,0.75)" /><stop offset="100%" stopColor="rgba(50,130,255,0)" />
            </linearGradient>
            <linearGradient id="sh7" x1="328" y1="38" x2="200" y2="118" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="rgba(100,185,255,0.6)" /><stop offset="100%" stopColor="rgba(40,110,255,0)" />
            </linearGradient>
            <linearGradient id="sh8" x1="328" y1="38" x2="310" y2="118" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="rgba(140,210,255,0.5)" /><stop offset="100%" stopColor="rgba(60,140,255,0)" />
            </linearGradient>
            <filter id="fglow-h" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="fglow-h2" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.2" result="b" />
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          {/* Background glow at focal point */}
          <ellipse cx="328" cy="38" rx="60" ry="40" fill="url(#focal-h)" />
          {/* Fan streaks */}
          <line x1="328" y1="38" x2="-20" y2="-20" stroke="url(#sh1)" strokeWidth="2.5" filter="url(#fglow-h)" />
          <line x1="328" y1="38" x2="60" y2="-15" stroke="url(#sh2)" strokeWidth="2" filter="url(#fglow-h)" />
          <line x1="328" y1="38" x2="170" y2="-18" stroke="url(#sh3)" strokeWidth="1.5" filter="url(#fglow-h2)" />
          <line x1="328" y1="38" x2="-30" y2="55" stroke="url(#sh4)" strokeWidth="2" filter="url(#fglow-h)" />
          <line x1="328" y1="38" x2="-30" y2="100" stroke="url(#sh5)" strokeWidth="2.5" filter="url(#fglow-h)" />
          <line x1="328" y1="38" x2="60" y2="118" stroke="url(#sh6)" strokeWidth="1.8" filter="url(#fglow-h2)" />
          <line x1="328" y1="38" x2="200" y2="118" stroke="url(#sh7)" strokeWidth="1.5" filter="url(#fglow-h2)" />
          <line x1="328" y1="38" x2="310" y2="118" stroke="url(#sh8)" strokeWidth="1" filter="url(#fglow-h2)" />
          {/* Bright core accent lines (no blur, sharp) */}
          <line x1="328" y1="38" x2="-20" y2="-20" stroke="rgba(220,240,255,0.6)" strokeWidth="0.7" />
          <line x1="328" y1="38" x2="-30" y2="100" stroke="rgba(200,230,255,0.5)" strokeWidth="0.6" />
          <line x1="328" y1="38" x2="60" y2="-15" stroke="rgba(210,235,255,0.55)" strokeWidth="0.5" />
        </svg>
      </div>
      <div className="flex items-center justify-between px-4 py-3" style={{ position: "relative", zIndex: 1 }}>
        <div className="flex items-center">
          <img
            src={veranoLogo}
            alt="Verano Sports"
            className="h-14 w-auto object-contain drop-shadow-lg"
            data-testid="img-logo"
          />
        </div>

        <div className="flex items-center gap-2">
          {!loading && !user ? (
            <>
              <button
                onClick={onOpenRegister}
                className="px-4 py-2 rounded-lg font-bold text-sm transition-colors"
                style={{ background: "rgba(232,124,30,0.15)", color: "#e87c1e", border: "1px solid rgba(232,124,30,0.4)" }}
                data-testid="button-register"
              >
                Registre-se
              </button>
              <button
                onClick={onOpenLogin}
                className="px-4 py-2 rounded-lg font-bold text-sm transition-colors text-white"
                style={{ background: "#1565C0" }}
                data-testid="button-login"
              >
                Login
              </button>
            </>
          ) : !loading && user ? (
            <>
              <button
                onClick={onOpenHistory}
                className="relative flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-sm shadow-md text-white transition-colors"
                style={{ background: "#1565C0" }}
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
                onClick={onOpenProfile}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-sm shadow-md transition-colors"
                style={{ background: "rgba(232,124,30,0.15)", border: "1px solid rgba(232,124,30,0.4)" }}
                data-testid="button-open-profile"
              >
                <span className="text-xs font-mono" style={{ color: "#e87c1e" }}>
                  R${user.balance.toFixed(2).replace(".", ",")}
                </span>
                <UserCircle className="w-5 h-5 text-white" />
              </button>
            </>
          ) : null}

          {user && (
            <button
              onClick={onOpenBetSlip}
              className="relative flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-sm shadow-md text-white transition-colors"
              style={{ background: "#e87c1e" }}
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
          )}
        </div>
      </div>
    </header>
  );
}
