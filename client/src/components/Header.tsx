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
      {/* Neon streaks overlay */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 92% 20%, rgba(0,160,255,0.55) 0%, rgba(0,100,220,0.25) 30%, transparent 65%)" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 80% 80%, rgba(0,80,200,0.3) 0%, transparent 50%)" }} />
        {/* Neon lines */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 400 120" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="neon-h">
              <feGaussianBlur stdDeviation="1.8" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="neon-h2">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {/* Main bright streaks */}
          <line x1="210" y1="140" x2="420" y2="-10" stroke="rgba(80,180,255,0.9)" strokeWidth="1.5" filter="url(#neon-h)" />
          <line x1="230" y1="140" x2="440" y2="-10" stroke="rgba(100,200,255,0.7)" strokeWidth="1" filter="url(#neon-h)" />
          <line x1="250" y1="140" x2="460" y2="-10" stroke="rgba(60,160,255,0.8)" strokeWidth="2" filter="url(#neon-h2)" />
          <line x1="270" y1="140" x2="480" y2="-10" stroke="rgba(120,210,255,0.6)" strokeWidth="1" filter="url(#neon-h)" />
          <line x1="295" y1="140" x2="505" y2="-10" stroke="rgba(80,180,255,0.85)" strokeWidth="1.5" filter="url(#neon-h)" />
          <line x1="320" y1="140" x2="530" y2="-10" stroke="rgba(40,140,255,0.5)" strokeWidth="1" filter="url(#neon-h)" />
          <line x1="180" y1="140" x2="390" y2="-10" stroke="rgba(60,160,255,0.4)" strokeWidth="1" filter="url(#neon-h)" />
          {/* Accent bright line */}
          <line x1="258" y1="140" x2="468" y2="-10" stroke="rgba(180,230,255,1)" strokeWidth="0.8" />
          <line x1="283" y1="140" x2="493" y2="-10" stroke="rgba(180,230,255,0.9)" strokeWidth="0.6" />
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
