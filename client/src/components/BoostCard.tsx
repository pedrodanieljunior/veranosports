import { Zap } from "lucide-react";
import { BoostCard as BoostCardType } from "@shared/schema";
import { Selection } from "@shared/schema";
import { fmtOdds } from "@/lib/formatOdds";

interface BoostCardProps {
  card: BoostCardType;
  selections: Selection[];
  onToggleSelection: (selection: Selection) => void;
}

export function BoostCard({ card, selections, onToggleSelection }: BoostCardProps) {
  const hasOutcomes = card.outcomes && card.outcomes.length > 0;

  const singleId = `boost-${card.id}`;
  const isSingleSelected = !hasOutcomes && selections.some(s => s.id === singleId);
  const selectedOutcomeId = hasOutcomes
    ? selections.find(s => s.id.startsWith(`boost-${card.id}-`))?.id ?? null
    : null;
  const isAnySelected = isSingleSelected || !!selectedOutcomeId;

  const makeSelection = (outcomeIdx?: number): Selection => {
    if (hasOutcomes && outcomeIdx !== undefined) {
      const o = card.outcomes[outcomeIdx];
      return {
        id: `boost-${card.id}-${outcomeIdx}`,
        gameId: `boost-${card.id}`,
        homeTeam: card.matchTitle,
        awayTeam: "",
        commenceTime: card.endsAt,
        sportTitle: card.eventName,
        marketKey: "boost",
        bookmaker: "Verano Sports",
        outcome: o.label,
        odds: o.boostedOdds,
        originalOdds: o.originalOdds,
      };
    }
    return {
      id: singleId,
      gameId: `boost-${card.id}`,
      homeTeam: card.matchTitle,
      awayTeam: "",
      commenceTime: card.endsAt,
      sportTitle: card.eventName,
      marketKey: "boost",
      bookmaker: "Verano Sports",
      outcome: "Super Boost",
      odds: card.boostedOdds,
      originalOdds: card.originalOdds,
    };
  };


  const cardStyle = {
    background: "linear-gradient(135deg, #0f2d6b 0%, #1a4fad 30%, #2563eb 55%, #1a4fad 75%, #0f2d6b 100%)",
    border: isAnySelected ? "2px solid #b8860b" : "2px solid #8a6300",
    boxShadow: isAnySelected
      ? "0 0 0 1px #b8860b40, 0 6px 24px #b8860b30"
      : "0 3px 16px rgba(0,0,0,0.4), 0 0 0 1px #8a630030",
  };

  return (
    <div
      className={`relative rounded-xl overflow-hidden mx-3 mb-2.5 ${!hasOutcomes ? "cursor-pointer" : ""}`}
      style={cardStyle}
      onClick={!hasOutcomes ? () => onToggleSelection(makeSelection()) : undefined}
      data-testid={`boost-card-${card.id}`}
    >
      {/* Golden left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: "linear-gradient(180deg, #f5c518 0%, #e8a800 100%)" }} />

      <div className="pl-4 pr-3 pt-3 pb-2.5">
        {/* Event name */}
        <p className="text-center text-[11px] font-medium mb-0.5" style={{ color: "#f5c518" }}>
          {card.eventName}
        </p>

        {/* Match title */}
        <h3 className="text-center text-sm leading-tight mb-0.5" style={{ color: "#f5c518" }}>
          {card.matchTitle}
        </h3>

        {/* Date / time from admin — same style as eventName */}
        {card.description && (
          <p className="text-center text-[11px] font-medium mb-2" style={{ color: "#aaa" }}>
            {card.description}
          </p>
        )}

        {/* Market subtitle — white, bold, italic */}
        {card.subtitle && (
          <p className="text-center text-sm font-semibold italic mb-2" style={{ color: "#fff" }}>
            {card.subtitle}
          </p>
        )}

        {/* Divider */}
        <div className="border-t mb-2" style={{ borderColor: "#f5c518" }} />

        {/* SUPER BOOST badge */}
        <div className="mb-2">
          <span
            className="inline-block text-[11px] font-black italic px-2 py-0.5 rounded-full"
            style={{
              color: "#f5c518",
              border: "1.5px solid #f5c518",
              letterSpacing: "0.05em",
              background: "#f5c51812",
            }}
          >
            ⚡ SUPER BOOST VERANO
          </span>
        </div>

        {/* Selections list */}
        {card.selections.length > 0 && (
          <div className="relative pl-4 mb-2">
            {card.selections.length > 1 && (
              <div
                className="absolute left-[4px] top-[5px] w-[2px]"
                style={{
                  background: "linear-gradient(180deg, #f5c518 0%, #e8a800 100%)",
                  height: "calc(100% - 10px)",
                }}
              />
            )}
            {card.selections.map((sel, idx) => (
              <div key={idx} className={`relative${idx > 0 ? " mt-2" : ""}`}>
                <div
                  className="absolute -left-4 top-[3px] w-[9px] h-[9px] rounded-full z-10"
                  style={{
                    background: "linear-gradient(135deg, #f5c518 0%, #e8a800 100%)",
                    boxShadow: "0 0 5px #f5c51860",
                  }}
                />
                <p className="text-sm font-semibold italic leading-snug" style={{ color: "#fff" }}>
                  {sel.description}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── SINGLE ODDS (no outcomes) ── */}
        {!hasOutcomes && (
          <div
            className="flex items-center justify-center gap-2.5 rounded-lg px-3 py-2 mt-0.5"
            style={{ background: "rgba(255,255,255,0.08)", border: isAnySelected ? "1.5px solid #f5c518" : "1px solid rgba(245,197,24,0.25)" }}
          >
            <span className="text-sm font-semibold line-through" style={{ color: "#bbb", textDecorationColor: "#999" }}>
              {fmtOdds(card.originalOdds)}
            </span>
            <Zap className="w-4 h-4 flex-shrink-0" style={{ color: "#f5c518", fill: "#f5c518" }} />
            <span className="text-xl font-extrabold" style={{ color: "#f5c518" }}>
              {fmtOdds(card.boostedOdds)}
            </span>
          </div>
        )}

        {/* ── MULTI OUTCOMES (selectable buttons) ── */}
        {hasOutcomes && (
          <div className="flex flex-col gap-1.5 mt-0.5">
            {card.outcomes.map((o, idx) => {
              const selId = `boost-${card.id}-${idx}`;
              const isChosen = selectedOutcomeId === selId;
              return (
                <button
                  key={idx}
                  onClick={() => onToggleSelection(makeSelection(idx))}
                  className="w-full flex items-center justify-between rounded-lg px-3 py-2 transition-all"
                  style={{
                    background: isChosen ? "linear-gradient(135deg, #bfdbfe 0%, #dbeafe 100%)" : "linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)",
                    border: isChosen ? "1.5px solid #ea580c" : "1px solid #bfdbfe",
                    cursor: "pointer",
                  }}
                >
                  <span className="text-xs font-semibold" style={{ color: isChosen ? "#1d4ed8" : "#111" }}>
                    {o.label}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs line-through" style={{ color: "#666", textDecorationColor: "#555" }}>
                      {fmtOdds(o.originalOdds)}
                    </span>
                    <Zap className="w-3 h-3 flex-shrink-0" style={{ color: "#b8860b", fill: "#b8860b" }} />
                    <span className="text-sm font-extrabold" style={{ color: "#b8860b" }}>
                      {fmtOdds(o.boostedOdds)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Selected indicator */}
        {isAnySelected && (
          <div className="mt-2 text-center">
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: "#f5c51820", color: "#f5c518", border: "1px solid #f5c51850" }}>
              ✓ Adicionado ao bilhete
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
