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

  const colorFrom = card.gradientFrom || "#0f2d6b";
  const colorTo = card.gradientTo || "#1a0a0a";

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

  const hasImage = !!(card as any).hasImage;
  const imgSrc = hasImage ? `/api/boost-cards/${card.id}/image` : null;
  const cardStyle = {
    background: imgSrc
      ? `linear-gradient(135deg, ${colorFrom}cc 0%, ${colorTo}dd 60%, ${colorFrom}cc 100%), url(${imgSrc}) center/cover no-repeat`
      : `linear-gradient(135deg, ${colorFrom} 0%, ${colorTo} 60%, ${colorFrom} 100%)`,
    border: isAnySelected ? "2px solid rgba(255,255,255,0.6)" : "2px solid rgba(255,255,255,0.18)",
    boxShadow: isAnySelected
      ? `0 0 0 1px rgba(255,255,255,0.2), 0 6px 28px rgba(0,0,0,0.55)`
      : `0 4px 20px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.07)`,
  };

  return (
    <div
      className={`relative rounded-xl overflow-hidden mx-3 mb-2.5 ${!hasOutcomes ? "cursor-pointer" : ""}`}
      style={cardStyle}
      onClick={!hasOutcomes ? () => onToggleSelection(makeSelection()) : undefined}
      data-testid={`boost-card-${card.id}`}
    >
      {/* Top accent bar */}
      <div className="absolute left-0 top-0 right-0 h-[2px] rounded-t-xl"
        style={{ background: `linear-gradient(90deg, ${colorTo}, rgba(255,255,255,0.5), ${colorFrom})` }} />

      <div className="px-4 pt-4 pb-3">
        {/* Header badge */}
        <div className="flex items-center justify-center mb-1">
          <span className="text-[11px] font-black tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.6)" }}>
            ⚡ Super Boost Verano
          </span>
        </div>

        {/* Event name */}
        <p className="text-center text-[11px] font-medium mb-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>
          {card.eventName}
        </p>

        {/* Match title */}
        <h3 className="text-center text-sm font-black leading-tight mb-0.5 text-white" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}>
          {card.matchTitle}
        </h3>

        {/* Description */}
        {card.description && (
          <p className="text-center text-[11px] mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>
            {card.description}
          </p>
        )}

        {/* Subtitle */}
        {card.subtitle && (
          <p className="text-center text-sm font-semibold italic mb-2 text-white">
            {card.subtitle}
          </p>
        )}

        {/* Divider */}
        <div className="border-t mb-2.5" style={{ borderColor: "rgba(255,255,255,0.15)" }} />

        {/* Selections list */}
        {card.selections.length > 0 && (
          <div className="relative pl-4 mb-2.5">
            {card.selections.length > 1 && (
              <div
                className="absolute left-[4px] top-[5px] w-[2px]"
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.15) 100%)",
                  height: "calc(100% - 10px)",
                }}
              />
            )}
            {card.selections.map((sel, idx) => (
              <div key={idx} className={`relative${idx > 0 ? " mt-2" : ""}`}>
                <div
                  className="absolute -left-4 top-[3px] w-[9px] h-[9px] rounded-full z-10"
                  style={{
                    background: "rgba(255,255,255,0.7)",
                    boxShadow: "0 0 5px rgba(255,255,255,0.4)",
                  }}
                />
                <p className="text-sm font-semibold italic leading-snug text-white">
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
            style={{
              background: "rgba(0,0,0,0.3)",
              border: isAnySelected ? "1.5px solid rgba(255,255,255,0.5)" : "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <span className="text-sm font-semibold line-through" style={{ color: "rgba(255,255,255,0.4)", textDecorationColor: "rgba(255,255,255,0.3)" }}>
              {fmtOdds(card.originalOdds)}
            </span>
            <Zap className="w-4 h-4 flex-shrink-0 text-white" style={{ fill: "rgba(255,255,255,0.9)" }} />
            <span className="text-xl font-extrabold text-white">
              {fmtOdds(card.boostedOdds)}
            </span>
          </div>
        )}

        {/* ── MULTI OUTCOMES ── */}
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
                    background: isChosen ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)",
                    border: isChosen ? "1.5px solid rgba(255,255,255,0.6)" : "1px solid rgba(255,255,255,0.18)",
                    cursor: "pointer",
                  }}
                >
                  <span className="text-xs font-semibold text-white">
                    {o.label}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs line-through" style={{ color: "rgba(255,255,255,0.4)" }}>
                      {fmtOdds(o.originalOdds)}
                    </span>
                    <Zap className="w-3 h-3 flex-shrink-0 text-white" style={{ fill: "rgba(255,255,255,0.9)" }} />
                    <span className="text-sm font-extrabold text-white">
                      {fmtOdds(o.boostedOdds)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Min/Max stake notice */}
        {((card as any).minStake != null && (card as any).minStake > 0) || (card.maxStake != null && card.maxStake > 0) ? (
          <p className="text-center text-[10px] mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
            {(card as any).minStake != null && (card as any).minStake > 0 && card.maxStake != null && card.maxStake > 0
              ? `Aposta: R$ ${(card as any).minStake.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} – R$ ${card.maxStake.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
              : (card as any).minStake != null && (card as any).minStake > 0
              ? `Aposta mínima: R$ ${(card as any).minStake.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
              : `Aposta máxima: R$ ${card.maxStake!.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
            }
          </p>
        ) : null}

        {/* Selected indicator */}
        {isAnySelected && (
          <div className="mt-2 text-center">
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white"
              style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)" }}>
              ✓ Adicionado ao bilhete
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
