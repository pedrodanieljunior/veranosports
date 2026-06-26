import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Trophy, Loader2, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DueloData {
  id: number;
  title: string;
  description: string;
  optionA: string;
  optionB: string;
  hasImage: boolean;
  entryFee: number;
  status: string;
  totalEntries: number;
  countA: number;
  countB: number;
  pctA: number;
  pctB: number;
  prizePool: number;
  userEntry: { side: string } | null;
}

interface DueloCardProps {
  duelo: DueloData;
  isLoggedIn: boolean;
  userBalance: number;
  onLoginRequired: () => void;
}

export function DueloCard({ duelo, isLoggedIn, userBalance, onLoginRequired }: DueloCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fee = duelo.entryFee ?? 10;
  const hasEnoughBalance = userBalance >= fee;
  const alreadyVoted = !!duelo.userEntry;

  const enterMutation = useMutation({
    mutationFn: async (side: string) => {
      const res = await apiRequest("POST", `/api/duelo/${duelo.id}/enter`, { side });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Erro ao participar"); }
      return res.json();
    },
    onSuccess: (_data, side) => {
      queryClient.invalidateQueries({ queryKey: ["/api/duelo/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "✅ Participação confirmada!", description: `Você escolheu: ${side === "A" ? duelo.optionA : duelo.optionB}` });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const handleVote = (side: string) => {
    if (!isLoggedIn) { onLoginRequired(); return; }
    if (!hasEnoughBalance) {
      toast({ title: "Saldo insuficiente", description: `Você precisa de R$ ${fee.toFixed(2)} em saldo real para participar.`, variant: "destructive" });
      return;
    }
    enterMutation.mutate(side);
  };

  const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div
      className="mx-3 mb-3 rounded-xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #1a0533 0%, #3b0764 40%, #4c1d95 70%, #1a0533 100%)",
        border: "2px solid #7c3aed",
        boxShadow: "0 4px 24px rgba(124,58,237,0.35), 0 0 0 1px rgba(124,58,237,0.2)",
      }}
      data-testid="duelo-card"
    >
      {/* Cover image */}
      {duelo.hasImage && (
        <div className="w-full h-36 overflow-hidden relative">
          <img
            src={`/api/duelo/${duelo.id}/image`}
            alt={duelo.title}
            className="w-full h-full object-cover"
            style={{ filter: "brightness(0.85)" }}
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 50%, #1a0533 100%)" }} />
        </div>
      )}

      <div className="px-4 pt-3 pb-3">
        {/* Header badge */}
        <div className="flex items-center justify-center mb-1">
          <span className="text-xs font-black tracking-widest uppercase" style={{ color: "#c084fc" }}>
            ⚔️ Duelo
          </span>
        </div>

        {/* Title */}
        <h3 className="text-center font-black text-lg leading-tight mb-0.5" style={{ color: "#fff", textShadow: "0 1px 8px rgba(192,132,252,0.4)" }}>
          {duelo.title}
        </h3>
        {duelo.description && (
          <p className="text-center text-xs mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>{duelo.description}</p>
        )}

        {/* Stats row */}
        <div className="flex items-center justify-center gap-4 mb-3">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" style={{ color: "#c084fc" }} />
            <span className="text-xs font-semibold text-white">{duelo.totalEntries} {duelo.totalEntries === 1 ? "participante" : "participantes"}</span>
          </div>
          <div className="w-px h-4" style={{ background: "rgba(255,255,255,0.2)" }} />
          <div className="flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" style={{ color: "#c084fc" }} />
            <span className="text-xs font-semibold text-white">R$ {fmt(duelo.prizePool)} em prêmios</span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t mb-3" style={{ borderColor: "rgba(192,132,252,0.3)" }} />

        {/* Two sides */}
        <div className="flex gap-2 mb-3">
          {(["A", "B"] as const).map(side => {
            const label = side === "A" ? duelo.optionA : duelo.optionB;
            const pct = side === "A" ? duelo.pctA : duelo.pctB;
            const count = side === "A" ? duelo.countA : duelo.countB;
            const isMyVote = duelo.userEntry?.side === side;
            const isWinning = side === "A" ? duelo.pctA >= duelo.pctB : duelo.pctB > duelo.pctA;

            return (
              <button
                key={side}
                onClick={() => !alreadyVoted && handleVote(side)}
                disabled={enterMutation.isPending || alreadyVoted}
                className="flex-1 rounded-lg p-3 transition-all active:scale-95 disabled:cursor-default"
                style={{
                  background: isMyVote
                    ? "rgba(192,132,252,0.25)"
                    : "rgba(255,255,255,0.07)",
                  border: isMyVote
                    ? "2px solid #c084fc"
                    : isWinning && duelo.totalEntries > 0
                      ? "2px solid rgba(192,132,252,0.4)"
                      : "2px solid rgba(255,255,255,0.12)",
                }}
                data-testid={`duelo-vote-${side}`}
              >
                {/* Option label */}
                <p className="font-black text-sm text-center mb-2 leading-tight" style={{ color: isMyVote ? "#c084fc" : "#fff" }}>
                  {label}
                </p>

                {/* Percentage bar */}
                <div className="w-full rounded-full mb-1.5" style={{ height: 6, background: "rgba(255,255,255,0.1)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: isMyVote
                        ? "linear-gradient(90deg, #a855f7, #c084fc)"
                        : "linear-gradient(90deg, #6d28d9, #8b5cf6)",
                    }}
                  />
                </div>

                {/* Pct + count */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold" style={{ color: isMyVote ? "#c084fc" : "rgba(255,255,255,0.7)" }}>
                    {duelo.totalEntries === 0 ? "—" : `${pct}%`}
                  </span>
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {count} {count === 1 ? "voto" : "votos"}
                  </span>
                </div>

                {/* My vote badge */}
                {isMyVote && (
                  <div className="flex items-center justify-center gap-1 mt-1.5">
                    <CheckCircle2 className="w-3 h-3" style={{ color: "#c084fc" }} />
                    <span className="text-[10px] font-bold" style={{ color: "#c084fc" }}>Seu voto</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Enter footer */}
        {!alreadyVoted && (
          <div className="text-center">
            {enterMutation.isPending ? (
              <div className="flex items-center justify-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
                <Loader2 className="w-3 h-3 animate-spin" /> Participando...
              </div>
            ) : (
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                {isLoggedIn && !hasEnoughBalance
                  ? "🔒 Saldo insuficiente (apenas saldo real)"
                  : `Participar por R$ ${fee.toFixed(2)} — clique em um lado`}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
