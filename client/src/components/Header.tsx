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
      {/* Neon curved streaks overlay */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} viewBox="0 0 400 100" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          <defs>
            {/* Horizontal fade: bright right → transparent left */}
            <linearGradient id="hg1" x1="100%" y1="0%" x2="30%" y2="0%">
              <stop offset="0%" stopColor="rgba(160,220,255,0.95)" />
              <stop offset="50%" stopColor="rgba(100,185,255,0.55)" />
              <stop offset="100%" stopColor="rgba(60,150,255,0)" />
            </linearGradient>
            <linearGradient id="hg2" x1="100%" y1="0%" x2="40%" y2="0%">
              <stop offset="0%" stopColor="rgba(180,235,255,0.85)" />
              <stop offset="55%" stopColor="rgba(120,195,255,0.4)" />
              <stop offset="100%" stopColor="rgba(70,155,255,0)" />
            </linearGradient>
            <linearGradient id="hg3" x1="100%" y1="0%" x2="50%" y2="0%">
              <stop offset="0%" stopColor="rgba(140,210,255,0.7)" />
              <stop offset="100%" stopColor="rgba(50,140,255,0)" />
            </linearGradient>
            {/* Glow blur filters */}
            <filter id="glow-a" x="-30%" y="-80%" width="160%" height="260%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="glow-b" x="-30%" y="-60%" width="160%" height="220%">
              <feGaussianBlur stdDeviation="1.8" result="b" />
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            {/* Mask: fade left edge so streaks don't reach logo area */}
            <linearGradient id="mask-g" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="black" />
              <stop offset="30%" stopColor="black" />
              <stop offset="55%" stopColor="white" />
              <stop offset="100%" stopColor="white" />
            </linearGradient>
            <mask id="streak-mask">
              <rect width="400" height="100" fill="url(#mask-g)" />
            </mask>
          </defs>
          {/* Radial glow bloom at focal area (right side) */}
          <ellipse cx="390" cy="50" rx="80" ry="60" fill="rgba(60,140,255,0.18)" />
          <ellipse cx="380" cy="50" rx="40" ry="30" fill="rgba(100,190,255,0.22)" />
          {/* Curved streaks — using cubic bezier Q control points for elegant arcs */}
          <g mask="url(#streak-mask)">
            {/* Glow layer (blurred, thick) */}
            <path d="M 410 50 Q 300 -30 -20 -5"   stroke="url(#hg1)" strokeWidth="5"   fill="none" filter="url(#glow-a)" />
            <path d="M 410 50 Q 310 -10 -20 15"   stroke="url(#hg2)" strokeWidth="4"   fill="none" filter="url(#glow-a)" />
            <path d="M 410 50 Q 320 10  -20 35"   stroke="url(#hg1)" strokeWidth="3.5" fill="none" filter="url(#glow-a)" />
            <path d="M 410 50 Q 320 55  -20 60"   stroke="url(#hg2)" strokeWidth="3"   fill="none" filter="url(#glow-b)" />
            <path d="M 410 50 Q 310 75  -20 80"   stroke="url(#hg1)" strokeWidth="4"   fill="none" filter="url(#glow-a)" />
            <path d="M 410 50 Q 300 90  -20 105"  stroke="url(#hg3)" strokeWidth="3"   fill="none" filter="url(#glow-b)" />
            <path d="M 410 50 Q 290 110 100 120"  stroke="url(#hg3)" strokeWidth="2.5" fill="none" filter="url(#glow-b)" />
            {/* Sharp bright core lines */}
            <path d="M 410 50 Q 300 -30 -20 -5"  stroke="rgba(220,242,255,0.8)" strokeWidth="0.8" fill="none" />
            <path d="M 410 50 Q 310 -10 -20 15"  stroke="rgba(210,238,255,0.7)" strokeWidth="0.6" fill="none" />
            <path d="M 410 50 Q 320 10  -20 35"  stroke="rgba(200,235,255,0.65)" strokeWidth="0.7" fill="none" />
            <path d="M 410 50 Q 320 55  -20 60"  stroke="rgba(200,235,255,0.6)" strokeWidth="0.5" fill="none" />
            <path d="M 410 50 Q 310 75  -20 80"  stroke="rgba(215,238,255,0.7)" strokeWidth="0.8" fill="none" />
            <path d="M 410 50 Q 300 90  -20 105" stroke="rgba(200,232,255,0.6)" strokeWidth="0.6" fill="none" />
          </g>
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
