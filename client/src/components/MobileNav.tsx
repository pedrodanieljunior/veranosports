import { Sport } from "@shared/schema";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { translateLeagueName } from "@/lib/leagueTranslations";
import { proxyLogoUrl } from "@/lib/imgProxy";
import { isNative } from "@/lib/platform";

interface MobileNavProps {
  sports: Sport[];
  selectedSport: string | null;
  onSelectSport: (sportKey: string | null) => void;
  isLoading: boolean;
  triggerLabel?: string;
  triggerIcon?: string;
}

import { LEAGUE_IDS } from "@/lib/leagueIds";

const PRINCIPAIS = [
  { key: null,                                label: "Todas as Ligas"   },
  { key: "soccer_brazil_campeonato",          label: "Brasileirão"      },
  { key: "soccer_conmebol_copa_libertadores", label: "Libertadores"     },
  { key: "soccer_epl",                        label: "Premier League"   },
  { key: "soccer_spain_la_liga",              label: "La Liga"          },
  { key: "soccer_uefa_champs_league",         label: "Champions League" },
  { key: "soccer_italy_serie_a",              label: "Serie A"          },
  { key: "soccer_germany_bundesliga",         label: "Bundesliga"       },
];

/* ── Ícone de liga — imagem real da API ou fallback ── */
function LeagueIcon({ leagueId, fallback }: { leagueId?: number; fallback: string }) {
  const [broken, setBroken] = useState(false);

  if (!leagueId || broken) {
    return (
      <span className="w-7 h-7 flex items-center justify-center text-base leading-none">
        {fallback}
      </span>
    );
  }

  const url = proxyLogoUrl(`https://media.api-sports.io/football/leagues/${leagueId}.png`);

  return (
    <img
      src={url}
      alt=""
      width={28}
      height={28}
      className="w-7 h-7 object-contain rounded-sm flex-shrink-0"
      onError={() => setBroken(true)}
    />
  );
}

export function MobileNav({
  sports,
  selectedSport,
  onSelectSport,
  isLoading,
  triggerLabel = "Todas as Ligas",
  triggerIcon = "⚽",
}: MobileNavProps) {
  const [open, setOpen] = useState(false);

  // Drawer de ligas só aparece no app Android
  if (!isNative()) return null;

  const pick = (key: string | null) => {
    onSelectSport(key);
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="md:hidden inline-flex items-center gap-1 px-2 py-1.5 rounded-lg btn-gradient-animated shadow-sm"
          data-testid="button-mobile-menu"
        >
          <span className="text-sm">{triggerIcon}</span>
          <span className="font-bold text-[10px] whitespace-nowrap">{triggerLabel}</span>
        </button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="w-72 p-0 border-0 flex flex-col"
        style={{ background: "linear-gradient(to bottom, rgba(239,246,255,0.93) 0%, rgba(191,219,254,0.95) 100%)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRight: "1px solid rgba(147,197,253,0.5)" }}
      >
        {/* Topo */}
        <div className="px-5 pt-6 pb-4 border-b border-blue-200/60 flex items-center gap-2">
          <span className="text-lg">⚽</span>
          <p className="text-blue-900 font-black text-base tracking-wide">Ligas</p>
        </div>

        <ScrollArea className="flex-1">
          <div className="pb-6">

            {/* ══ Principais Ligas ══ */}
            <p className="px-5 pt-5 pb-2 text-[13px] font-extrabold tracking-widest uppercase text-blue-700 drawer-item-enter" style={{ animationDelay: "0ms" }}>
              Principais Ligas
            </p>

            {PRINCIPAIS.map(({ key, label }, idx) => {
              const active = key === selectedSport || (key === null && selectedSport === null);
              const leagueId = key ? (LEAGUE_IDS[key] ?? undefined) : undefined;

              if (key !== null && !isLoading && !sports.find(s => s.key === key)) return null;

              return (
                <button
                  key={String(key)}
                  onClick={() => pick(key)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors drawer-item-enter"
                  style={active
                    ? { background: "rgba(30,64,175,0.12)", borderLeft: "3px solid #1d4ed8", animationDelay: `${(idx + 1) * 45}ms` }
                    : { borderLeft: "3px solid transparent", animationDelay: `${(idx + 1) * 45}ms` }}
                >
                  {key === null
                    ? <span className="w-7 h-7 flex items-center justify-center text-xl">🌐</span>
                    : <LeagueIcon leagueId={leagueId} fallback="🏆" />
                  }
                  <span
                    className="text-[13px] text-left"
                    style={{ color: active ? "#1d4ed8" : "#1e3a5f" }}
                  >
                    {label}
                  </span>
                </button>
              );
            })}

            {/* ══ Todas as Ligas ══ */}
            <p className="px-5 pt-6 pb-2 text-[13px] font-extrabold tracking-widest uppercase text-blue-700 drawer-item-enter" style={{ animationDelay: `${(PRINCIPAIS.length + 1) * 45}ms` }}>
              Todas as Ligas
            </p>

            {isLoading ? (
              <div className="px-4 space-y-3 pt-1">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full bg-blue-200/40 rounded-lg" />
                ))}
              </div>
            ) : (
              sports.map((sport, idx) => {
                const active = selectedSport === sport.key;
                const leagueId = sport.leagueId ?? LEAGUE_IDS[sport.key];
                const label = translateLeagueName(sport.key, sport.title);
                const delay = (PRINCIPAIS.length + 2 + idx) * 45;

                return (
                  <button
                    key={sport.key}
                    onClick={() => pick(sport.key)}
                    className="w-full flex items-center gap-3 px-4 py-2 transition-colors hover:bg-blue-100/40 drawer-item-enter"
                    style={active
                      ? { background: "rgba(30,64,175,0.10)", borderLeft: "3px solid #1d4ed8", animationDelay: `${delay}ms` }
                      : { borderLeft: "3px solid transparent", animationDelay: `${delay}ms` }}
                    data-testid={`button-mobile-sport-${sport.key}`}
                  >
                    <LeagueIcon leagueId={leagueId} fallback="🏟️" />
                    <span
                      className="text-[13px] text-left leading-tight"
                      style={{ color: active ? "#1d4ed8" : "#1e3a5f" }}
                    >
                      {label}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
