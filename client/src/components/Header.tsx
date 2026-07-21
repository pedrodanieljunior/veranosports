import { History, Receipt, UserCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { NotificationPanel } from "@/components/NotificationPanel";
import headerBg from "@assets/IMG_0004_1780870047227.jpeg";

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
    <header className="sticky top-0 z-50 overflow-hidden" style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ position: "relative", zIndex: 1 }}>
        <div className="flex items-center">
          <img
            src="/verano-logo-animated.webp"
            alt="Verano Sports"
            className="h-20 w-auto object-contain"
            style={{ mixBlendMode: "screen" }}
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
              <NotificationPanel />
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
