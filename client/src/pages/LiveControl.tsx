import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { proxyLogoUrl } from "@/lib/imgProxy";
import { Lock, Unlock, Signal, WifiOff, RefreshCw } from "lucide-react";

interface LiveControlStatus {
  active: boolean;
  fixtureId?: number;
  gameInfo?: {
    home: string;
    away: string;
    league: string;
    homeLogo?: string;
    awayLogo?: string;
  };
  isLocked?: boolean;
}

function TeamLogo({ src, name }: { src?: string; name: string }) {
  const [err, setErr] = useState(false);
  const proxied = proxyLogoUrl(src);
  if (!proxied || err) {
    return (
      <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center text-3xl font-bold text-white/60">
        {name.charAt(0)}
      </div>
    );
  }
  return (
    <img
      src={proxied}
      alt={name}
      onError={() => setErr(true)}
      className="w-20 h-20 object-contain drop-shadow-lg"
    />
  );
}

export default function LiveControl() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("t") ?? "";
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useQuery<LiveControlStatus>({
    queryKey: ["/api/live-control/status", token],
    queryFn: async () => {
      const res = await fetch(`/api/live-control/status?t=${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Erro ao carregar");
      }
      return res.json();
    },
    refetchInterval: 10_000,
    enabled: !!token,
  });

  const toggleMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/live-control/toggle-lock?t=${token}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/live-control/status", token] }),
  });

  const isLocked = data?.isLocked ?? false;
  const gameInfo = data?.gameInfo;

  if (!token) {
    return (
      <div className="min-h-screen bg-[#0f1118] flex items-center justify-center p-6">
        <div className="text-center">
          <WifiOff className="w-12 h-12 mx-auto mb-4 text-red-400" />
          <p className="text-white font-bold text-lg">Link inválido</p>
          <p className="text-white/50 text-sm mt-1">Token de acesso não encontrado.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f1118] flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-white/30 animate-spin" />
      </div>
    );
  }

  if (isError) {
    const msg = (error as Error).message;
    return (
      <div className="min-h-screen bg-[#0f1118] flex items-center justify-center p-6">
        <div className="text-center">
          <WifiOff className="w-12 h-12 mx-auto mb-4 text-red-400" />
          <p className="text-white font-bold text-lg">Acesso negado</p>
          <p className="text-white/50 text-sm mt-2">{msg}</p>
        </div>
      </div>
    );
  }

  if (!data?.active) {
    return (
      <div className="min-h-screen bg-[#0f1118] flex flex-col items-center justify-center p-6 gap-4">
        <Signal className="w-14 h-14 text-white/20" />
        <p className="text-white font-bold text-xl">Nenhum jogo ativo</p>
        <p className="text-white/40 text-sm">Ative um jogo ao vivo no painel admin.</p>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ["/api/live-control/status", token] })}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/20 text-white/60 text-sm hover:bg-white/10 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1118] flex flex-col items-center justify-center p-6 gap-6">

      {/* Status pill */}
      <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold tracking-wide ${
        isLocked ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
      }`}>
        <span className={`w-2 h-2 rounded-full ${isLocked ? "bg-red-400" : "bg-green-400 animate-pulse"}`} />
        {isLocked ? "MERCADOS BLOQUEADOS" : "MERCADOS ABERTOS"}
      </div>

      {/* Game card */}
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col items-center gap-5">
        {/* League */}
        <p className="text-white/40 text-xs font-medium uppercase tracking-widest">
          {gameInfo?.league}
        </p>

        {/* Teams */}
        <div className="flex items-center justify-between w-full gap-3">
          <div className="flex-1 flex flex-col items-center gap-3">
            <TeamLogo src={gameInfo?.homeLogo} name={gameInfo?.home ?? "?"} />
            <p className="text-white font-bold text-base text-center leading-tight">
              {gameInfo?.home}
            </p>
          </div>

          <span className="text-white/30 text-2xl font-light">×</span>

          <div className="flex-1 flex flex-col items-center gap-3">
            <TeamLogo src={gameInfo?.awayLogo} name={gameInfo?.away ?? "?"} />
            <p className="text-white font-bold text-base text-center leading-tight">
              {gameInfo?.away}
            </p>
          </div>
        </div>
      </div>

      {/* Big toggle button */}
      <button
        onClick={() => toggleMut.mutate()}
        disabled={toggleMut.isPending}
        data-testid="button-mobile-toggle-lock"
        className={`w-full max-w-sm flex items-center justify-center gap-3 py-5 rounded-2xl text-white text-xl font-bold shadow-lg transition-all active:scale-95 disabled:opacity-60
          ${isLocked
            ? "bg-green-600 hover:bg-green-700 shadow-green-900/40"
            : "bg-red-600 hover:bg-red-700 shadow-red-900/40"
          }`}
      >
        {toggleMut.isPending ? (
          <RefreshCw className="w-6 h-6 animate-spin" />
        ) : isLocked ? (
          <Unlock className="w-6 h-6" />
        ) : (
          <Lock className="w-6 h-6" />
        )}
        {isLocked ? "Liberar Mercados" : "Bloquear Mercados"}
      </button>

      <p className="text-white/20 text-xs">Atualiza automaticamente a cada 10s</p>
    </div>
  );
}
