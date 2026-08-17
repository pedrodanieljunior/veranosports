import { Sport } from "@shared/schema";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { translateLeagueName } from "@/lib/leagueTranslations";

interface MobileNavProps {
  sports: Sport[];
  selectedSport: string | null;
  onSelectSport: (sportKey: string | null) => void;
  isLoading: boolean;
  /** Qual seção abrir por padrão ao clicar no trigger */
  defaultSection?: "principais" | "todas";
  /** Texto e ícone do botão trigger */
  triggerLabel?: string;
  triggerIcon?: string;
}

/* ── Bandeiras por liga ─────────────────────────────────────── */
const leagueFlag: Record<string, string> = {
  soccer_brazil_campeonato:              "🇧🇷",
  soccer_brazil_serie_b:                 "🇧🇷",
  soccer_brazil_copa_do_brasil:          "🇧🇷",
  soccer_epl:                            "🏴󠁧󠁢󠁥󠁫󠁢󠁷󠁿",
  soccer_fa_cup:                         "🏴󠁧󠁢󠁥󠁫󠁢󠁷󠁿",
  soccer_england_efl_cup:                "🏴󠁧󠁢󠁥󠁫󠁢󠁷󠁿",
  soccer_efl_champ:                      "🏴󠁧󠁢󠁥󠁫󠁢󠁷󠁿",
  soccer_england_league1:                "🏴󠁧󠁢󠁥󠁫󠁢󠁷󠁿",
  soccer_spain_la_liga:                  "🇪🇸",
  soccer_spain_segunda_division:         "🇪🇸",
  soccer_germany_bundesliga:             "🇩🇪",
  soccer_germany_bundesliga2:            "🇩🇪",
  soccer_italy_serie_a:                  "🇮🇹",
  soccer_italy_serie_b:                  "🇮🇹",
  soccer_france_ligue_one:              "🇫🇷",
  soccer_france_ligue_two:              "🇫🇷",
  soccer_portugal_primeira_liga:         "🇵🇹",
  soccer_netherlands_eredivisie:         "🇳🇱",
  soccer_turkey_super_league:            "🇹🇷",
  soccer_argentina_primera_division:     "🇦🇷",
  soccer_mexico_ligamx:                  "🇲🇽",
  soccer_usa_mls:                        "🇺🇸",
  soccer_japan_j_league:                 "🇯🇵",
  soccer_conmebol_copa_libertadores:     "🏆",
  soccer_conmebol_copa_sudamericana:     "🌎",
  soccer_uefa_champs_league:             "⭐",
  soccer_uefa_europa_league:             "🟠",
  soccer_uefa_europa_conference_league:  "🔵",
  soccer_international_friendlies:       "🌍",
  soccer_fifa_world_cup:                 "🏆",
  soccer_wc_qualifiers_conmebol:         "🌎",
  soccer_wc_qualifiers_europe:           "🌍",
  soccer_wc_qualifiers_concacaf:         "🌎",
  soccer_wc_qualifiers_caf:              "🌍",
  soccer_wc_qualifiers_afc:              "🌏",
  soccer_wc_intercontinental:            "🌐",
};

const PRINCIPAIS = [
  { key: null,                             label: "Todas as Ligas",        icon: "🌐" },
  { key: "soccer_brazil_campeonato",       label: "Brasileirão",           icon: "🇧🇷" },
  { key: "soccer_conmebol_copa_libertadores", label: "Libertadores",       icon: "🏆" },
  { key: "soccer_epl",                     label: "Premier League",        icon: "🏴󠁧󠁢󠁥󠁫󠁢󠁷󠁿" },
  { key: "soccer_spain_la_liga",           label: "La Liga",               icon: "🇪🇸" },
  { key: "soccer_uefa_champs_league",      label: "Champions League",      icon: "⭐" },
  { key: "soccer_italy_serie_a",           label: "Serie A",               icon: "🇮🇹" },
  { key: "soccer_germany_bundesliga",      label: "Bundesliga",            icon: "🇩🇪" },
];

export function MobileNav({
  sports,
  selectedSport,
  onSelectSport,
  isLoading,
  triggerLabel = "Todas as Ligas",
  triggerIcon = "⚽",
}: MobileNavProps) {
  const [open, setOpen] = useState(false);

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
        style={{ background: "rgba(10, 14, 26, 0.97)", borderRight: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* ── Logo / topo ─── */}
        <div className="px-5 pt-6 pb-4 border-b border-white/10">
          <p className="text-white font-black text-lg tracking-wide">⚽ Ligas</p>
        </div>

        <ScrollArea className="flex-1">
          <div className="pb-6">

            {/* ══ Principais Ligas ══ */}
            <p className="px-5 pt-5 pb-2 text-[11px] font-bold tracking-widest uppercase text-yellow-400/80">
              Principais Ligas
            </p>
            {PRINCIPAIS.map(({ key, label, icon }) => {
              const active = key === selectedSport || (key === null && selectedSport === null);
              // só mostra se a liga existe na lista da API (exceto "Todas as Ligas")
              if (key !== null && !isLoading && !sports.find(s => s.key === key)) return null;
              return (
                <button
                  key={String(key)}
                  onClick={() => pick(key)}
                  className="w-full flex items-center gap-3 px-5 py-3 transition-colors"
                  style={active
                    ? { background: "rgba(250,200,0,0.12)", borderLeft: "3px solid #facc00" }
                    : { borderLeft: "3px solid transparent" }}
                >
                  <span className="text-xl leading-none w-7 text-center">{icon}</span>
                  <span
                    className="text-[13px] font-semibold"
                    style={{ color: active ? "#facc00" : "rgba(255,255,255,0.88)" }}
                  >
                    {label}
                  </span>
                </button>
              );
            })}

            {/* ══ Todas as Ligas ══ */}
            <p className="px-5 pt-6 pb-2 text-[11px] font-bold tracking-widest uppercase text-white/40">
              Todas as Ligas
            </p>

            {isLoading ? (
              <div className="px-5 space-y-3 pt-1">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full bg-white/10 rounded-lg" />
                ))}
              </div>
            ) : (
              sports.map((sport) => {
                const active = selectedSport === sport.key;
                const flag = leagueFlag[sport.key] ?? "🏟️";
                const label = translateLeagueName(sport.key, sport.title);
                return (
                  <button
                    key={sport.key}
                    onClick={() => pick(sport.key)}
                    className="w-full flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-white/5"
                    style={active
                      ? { background: "rgba(250,200,0,0.10)", borderLeft: "3px solid #facc00" }
                      : { borderLeft: "3px solid transparent" }}
                    data-testid={`button-mobile-sport-${sport.key}`}
                  >
                    <span className="text-xl leading-none w-7 text-center">{flag}</span>
                    <span
                      className="text-[13px] text-left"
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
