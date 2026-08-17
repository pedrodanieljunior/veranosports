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

/* ── leagueId estático para itens da seção "Principais Ligas" ── */
const LEAGUE_IDS: Record<string, number> = {
  soccer_brazil_campeonato:              71,
  soccer_brazil_serie_b:                 72,
  soccer_brazil_copa_do_brasil:          73,
  soccer_epl:                            39,
  soccer_fa_cup:                         45,
  soccer_england_efl_cup:                48,
  soccer_efl_champ:                      40,
  soccer_england_league1:                41,
  soccer_spain_la_liga:                  140,
  soccer_spain_segunda_division:         141,
  soccer_germany_bundesliga:             78,
  soccer_germany_bundesliga2:            79,
  soccer_italy_serie_a:                  135,
  soccer_italy_serie_b:                  136,
  soccer_france_ligue_one:               61,
  soccer_france_ligue_two:               62,
  soccer_portugal_primeira_liga:         94,
  soccer_netherlands_eredivisie:         88,
  soccer_turkey_super_league:            203,
  soccer_argentina_primera_division:     128,
  soccer_mexico_ligamx:                  262,
  soccer_usa_mls:                        253,
  soccer_japan_j_league:                 98,
  soccer_conmebol_copa_libertadores:     13,
  soccer_conmebol_copa_sudamericana:     11,
  soccer_uefa_champs_league:             2,
  soccer_uefa_europa_league:             3,
  soccer_uefa_europa_conference_league:  848,
  soccer_international_friendlies:       10,
  soccer_fifa_world_cup:                 1,
  soccer_wc_qualifiers_conmebol:         31,
  soccer_wc_qualifiers_europe:           32,
  soccer_wc_qualifiers_concacaf:         30,
  soccer_wc_qualifiers_caf:              29,
  soccer_wc_qualifiers_afc:              28,
};

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
          className="md:hidden inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-black/20 hover:bg-black/30 transition-colors"
          data-testid="button-mobile-menu"
        >
          <span className="text-sm">{triggerIcon}</span>
          <span className="text-white font-bold text-[10px] whitespace-nowrap">{triggerLabel}</span>
        </button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="w-72 p-0 border-0 flex flex-col"
        style={{ background: "rgba(10, 14, 26, 0.25)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderRight: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* Topo */}
        <div className="px-5 pt-6 pb-4 border-b border-white/10 flex items-center gap-2">
          <span className="text-lg">⚽</span>
          <p className="text-white font-black text-base tracking-wide">Ligas</p>
        </div>

        <ScrollArea className="flex-1">
          <div className="pb-6">

            {/* ══ Principais Ligas ══ */}
            <p className="px-5 pt-5 pb-2 text-[10px] font-bold tracking-widest uppercase text-yellow-400/80">
              Principais Ligas
            </p>

            {PRINCIPAIS.map(({ key, label }) => {
              const active = key === selectedSport || (key === null && selectedSport === null);
              const leagueId = key ? (LEAGUE_IDS[key] ?? undefined) : undefined;

              // liga principal só aparece se existir na API (exceto "Todas as Ligas")
              if (key !== null && !isLoading && !sports.find(s => s.key === key)) return null;

              return (
                <button
                  key={String(key)}
                  onClick={() => pick(key)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors"
                  style={active
                    ? { background: "rgba(250,200,0,0.12)", borderLeft: "3px solid #facc00" }
                    : { borderLeft: "3px solid transparent" }}
                >
                  {key === null
                    ? <span className="w-7 h-7 flex items-center justify-center text-xl">🌐</span>
                    : <LeagueIcon leagueId={leagueId} fallback="🏆" />
                  }
                  <span
                    className="text-[13px] font-semibold text-left"
                    style={{ color: active ? "#facc00" : "rgba(255,255,255,0.9)" }}
                  >
                    {label}
                  </span>
                </button>
              );
            })}

            {/* ══ Todas as Ligas ══ */}
            <p className="px-5 pt-6 pb-2 text-[10px] font-bold tracking-widest uppercase text-white/40">
              Todas as Ligas
            </p>

            {isLoading ? (
              <div className="px-4 space-y-3 pt-1">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full bg-white/10 rounded-lg" />
                ))}
              </div>
            ) : (
              sports.map((sport) => {
                const active = selectedSport === sport.key;
                const leagueId = sport.leagueId ?? LEAGUE_IDS[sport.key];
                const label = translateLeagueName(sport.key, sport.title);

                return (
                  <button
                    key={sport.key}
                    onClick={() => pick(sport.key)}
                    className="w-full flex items-center gap-3 px-4 py-2 transition-colors hover:bg-white/5"
                    style={active
                      ? { background: "rgba(250,200,0,0.10)", borderLeft: "3px solid #facc00" }
                      : { borderLeft: "3px solid transparent" }}
                    data-testid={`button-mobile-sport-${sport.key}`}
                  >
                    <LeagueIcon leagueId={leagueId} fallback="🏟️" />
                    <span
                      className="text-[13px] text-left leading-tight"
                      style={{ color: active ? "#facc00" : "rgba(255,255,255,0.75)" }}
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
