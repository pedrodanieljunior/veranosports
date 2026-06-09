import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListChecks, Plus, Minus, Users, DollarSign, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface BolaoData {
  bolao: {
    id: number;
    homeTeam: string;
    awayTeam: string;
    matchDate: string;
    entryFee: number;
    status: string;
  };
  totalEntries: number;
  prizePool: number;
  userEntries: { id: number; homeScore: number; awayScore: number; createdAt: string }[];
}

interface BolaoCardProps {
  data: BolaoData;
  isLoggedIn: boolean;
  onLoginRequired: () => void;
}

export function BolaoCard({ data, isLoggedIn, onLoginRequired }: BolaoCardProps) {
  const { bolao, totalEntries, prizePool, userEntries } = data;
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const enterMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/bolao/${bolao.id}/enter`, { homeScore, awayScore });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao participar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bolao/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "✅ Participação confirmada!", description: `Seu palpite: ${bolao.homeTeam} ${homeScore}x${awayScore} ${bolao.awayTeam}` });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });

  const handleEnter = () => {
    if (!isLoggedIn) { onLoginRequired(); return; }
    enterMutation.mutate();
  };

  const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div
      className="mx-3 mb-3 rounded-xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0f2d6b 0%, #1a4fad 35%, #2563eb 60%, #1a4fad 80%, #0f2d6b 100%)",
        border: "2px solid #8a6300",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px #8a630030",
      }}
      data-testid="bolao-card"
    >
      {/* Golden left accent */}
      <div className="absolute" style={{ width: 4, background: "linear-gradient(180deg, #f5c518 0%, #e8a800 100%)", position: "relative" }} />

      <div className="px-4 pt-3 pb-3">
        {/* Header */}
        <div className="flex items-center justify-center gap-2 mb-1">
          <ListChecks className="w-4 h-4" style={{ color: "#f5c518" }} />
          <span className="text-xs font-black tracking-widest uppercase" style={{ color: "#f5c518" }}>
            Bolão da Copa
          </span>
        </div>

        {/* Teams */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <span className="text-white font-bold text-sm text-right flex-1 truncate text-right">{bolao.homeTeam}</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}>VS</span>
          <span className="text-white font-bold text-sm flex-1 truncate">{bolao.awayTeam}</span>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-center gap-4 mb-3">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" style={{ color: "#f5c518" }} />
            <span className="text-xs font-semibold text-white">{totalEntries} {totalEntries === 1 ? "participante" : "participantes"}</span>
          </div>
          <div className="w-px h-4" style={{ background: "rgba(255,255,255,0.2)" }} />
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" style={{ color: "#f5c518" }} />
            <span className="text-xs font-semibold text-white">R$ {fmt(prizePool)} em prêmios</span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t mb-3" style={{ borderColor: "rgba(245,197,24,0.3)" }} />

        {/* Score selector */}
        <div className="flex items-center justify-center gap-3 mb-3">
          {/* Home score */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-white/60 font-medium truncate max-w-[70px] text-center">{bolao.homeTeam}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setHomeScore(Math.max(0, homeScore - 1))}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}
                data-testid="bolao-home-minus"
              >
                <Minus className="w-3 h-3 text-white" />
              </button>
              <span className="text-2xl font-black text-white w-8 text-center">{homeScore}</span>
              <button
                onClick={() => setHomeScore(Math.min(20, homeScore + 1))}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
                style={{ background: "rgba(245,197,24,0.2)", border: "1px solid rgba(245,197,24,0.5)" }}
                data-testid="bolao-home-plus"
              >
                <Plus className="w-3 h-3" style={{ color: "#f5c518" }} />
              </button>
            </div>
          </div>

          <span className="text-xl font-black text-white/40 mb-1">×</span>

          {/* Away score */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-white/60 font-medium truncate max-w-[70px] text-center">{bolao.awayTeam}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAwayScore(Math.max(0, awayScore - 1))}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}
                data-testid="bolao-away-minus"
              >
                <Minus className="w-3 h-3 text-white" />
              </button>
              <span className="text-2xl font-black text-white w-8 text-center">{awayScore}</span>
              <button
                onClick={() => setAwayScore(Math.min(20, awayScore + 1))}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all active:scale-90"
                style={{ background: "rgba(245,197,24,0.2)", border: "1px solid rgba(245,197,24,0.5)" }}
                data-testid="bolao-away-plus"
              >
                <Plus className="w-3 h-3" style={{ color: "#f5c518" }} />
              </button>
            </div>
          </div>
        </div>

        {/* Enter button */}
        <button
          onClick={handleEnter}
          disabled={enterMutation.isPending}
          className="w-full py-2.5 rounded-lg font-black text-sm tracking-wide transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #f5c518 0%, #e8a800 100%)", color: "#0f2d6b" }}
          data-testid="bolao-enter-button"
        >
          {enterMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Participando...</>
          ) : (
            <>⚽ Participar por R$ {(bolao.entryFee ?? 10).toFixed(2)}</>
          )}
        </button>

        {/* User's own entries */}
        {userEntries.length > 0 && (
          <div className="mt-2.5">
            <p className="text-[10px] text-white/50 font-semibold mb-1.5 text-center uppercase tracking-wider">Seus palpites</p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {userEntries.map(e => (
                <span
                  key={e.id}
                  className="text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(245,197,24,0.15)", color: "#f5c518", border: "1px solid rgba(245,197,24,0.4)" }}
                >
                  {e.homeScore}×{e.awayScore}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
