import { Zap, Flame } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { BoostCard as BoostCardType } from "@shared/schema";
import { Selection } from "@shared/schema";
import { fmtOdds } from "@/lib/formatOdds";

/** Compute the current fake counter value based on exponential growth curve. */
function computeFakeCounter(start: number, target: number, createdAt: string, endsAt: string): number {
  if (!target || target <= 0) return 0;
  const now = Date.now();
  const from = new Date(createdAt).getTime();
  const to = new Date(endsAt).getTime();
  if (to <= from) return target;
  const progress = Math.min(1, Math.max(0, (now - from) / (to - from)));
  // Exponential growth: slow start → fast end, k=3
  const k = 3;
  const curve = (Math.exp(k * progress) - 1) / (Math.exp(k) - 1);
  return Math.floor(start + (target - start) * curve);
}

function FakeCounter({ card }: { card: BoostCardType }) {
  const target = (card as any).fakeCounterTarget as number ?? 0;
  const start = (card as any).fakeCounterStart as number ?? 0;
  const [displayed, setDisplayed] = useState(() => computeFakeCounter(start, target, card.createdAt, card.endsAt));
  const prevRef = useRef(displayed);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (!target || target <= 0) return;

    const scheduleNext = () => {
      // Random interval between 8s and 25s
      const delay = 8000 + Math.random() * 17000;
      return setTimeout(() => {
        setDisplayed(prev => {
          if (prev >= target) return prev;
          // Random jump: between 1 and ~2% of target, minimum 1
          const maxJump = Math.max(1, Math.floor(target * 0.02));
          const jump = 1 + Math.floor(Math.random() * maxJump);
          const next = Math.min(target, prev + jump);
          if (next !== prev) {
            prevRef.current = next;
            setAnimate(true);
            setTimeout(() => setAnimate(false), 600);
          }
          return next;
        });
        scheduleNext();
      }, delay);
    };

    const t = scheduleNext();
    return () => clearTimeout(t);
  }, [target, start, card.createdAt, card.endsAt]);

  if (!target || target <= 0) return null;

  return (
    <div
      className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", border: "1px solid rgba(255,255,255,0.15)" }}
    >
      <Flame className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#FF6B2B", fill: "#FF6B2B" }} />
      <span
        className="text-[11px] font-bold tabular-nums transition-all duration-500"
        style={{
          color: animate ? "#FFD700" : "rgba(255,255,255,0.85)",
          transform: animate ? "scale(1.1)" : "scale(1)",
          display: "inline-block",
        }}
      >
        {displayed.toLocaleString("pt-BR")} apostas
      </span>
    </div>
  );
}

interface BoostCardProps {
  card: BoostCardType;
  selections: Selection[];
  onToggleSelection: (selection: Selection) => void;
  usedByUser?: boolean;
}

export function BoostCard({ card, selections, onToggleSelection, usedByUser = false }: BoostCardProps) {
  const hasOutcomes = card.outcomes && card.outcomes.length > 0;

  const singleId = `boost-${card.id}`;
  const isSingleSelected = !hasOutcomes && selections.some(s => s.id === singleId);
  const selectedOutcomeId = hasOutcomes
    ? selections.find(s => s.id.startsWith(`boost-${card.id}-`))?.id ?? null
    : null;
  const isAnySelected = isSingleSelected || !!selectedOutcomeId;

  const colorFrom = card.gradientFrom || "#0f2d6b";
  const colorTo = card.gradientTo || "#1a0a0a";

  const hasImage = !!(card as any).hasImage;
  const imgSrc = hasImage ? `/api/boost-cards/${card.id}/image` : null;

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
        result: "pending" as const,
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
      result: "pending" as const,
    };
  };

  const wrapperBorder = usedByUser
    ? "2px solid rgba(255,255,255,0.08)"
    : isAnySelected
    ? "2px solid rgba(255,255,255,0.6)"
    : "2px solid rgba(255,255,255,0.18)";
  const wrapperShadow = usedByUser
    ? "0 2px 8px rgba(0,0,0,0.3)"
    : isAnySelected
    ? "0 0 0 1px rgba(255,255,255,0.2), 0 6px 28px rgba(0,0,0,0.55)"
    : "0 4px 20px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.07)";

  return (
    <div
      className={`relative rounded-xl overflow-hidden mx-3 mb-2.5 ${usedByUser ? "opacity-50 cursor-not-allowed" : !hasOutcomes ? "cursor-pointer" : ""}`}
      style={{ border: wrapperBorder, boxShadow: wrapperShadow }}
      onClick={!usedByUser && !hasOutcomes ? () => onToggleSelection(makeSelection()) : undefined}
      data-testid={`boost-card-${card.id}`}
    >
      {/* ── Fake counter overlay — top-left ── */}
      <FakeCounter card={card} />

      {/* ── Image section on top ── */}
      {imgSrc && (
        <div className="w-full overflow-hidden" style={{ maxHeight: 180 }}>
          <img
            src={imgSrc}
            alt={card.matchTitle}
            className="w-full object-cover"
            style={{ display: "block", maxHeight: 180 }}
          />
        </div>
      )}

      {/* ── Gradient content section ── */}
      <div
        style={{
          background: `linear-gradient(135deg, ${colorFrom} 0%, ${colorTo} 60%, ${colorFrom} 100%)`,
        }}
      >
        {/* Top accent bar (only shown when no image above) */}
        {!imgSrc && (
          <div className="absolute left-0 top-0 right-0 h-[2px] rounded-t-xl"
            style={{ background: `linear-gradient(90deg, ${colorTo}, rgba(255,255,255,0.5), ${colorFrom})` }} />
        )}

        <div className="px-4 pt-4 pb-3">
          {/* Header badge */}
          <div className="flex items-center justify-center mb-1">
            <span className="text-[11px] font-black tracking-widest uppercase" style={{ color: "#FFD700" }}>
              ⚡ Super Boost Verano
            </span>
          </div>

          {/* Event name */}
          <p className="text-center text-[11px] font-medium mb-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>
            {card.eventName}
          </p>

          {/* Match title */}
          <h3 className="text-center text-xs font-black leading-tight mb-2 text-white" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}>
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
            <p className="text-center text-base font-semibold italic mb-2 text-white">
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
                    onClick={() => !usedByUser && onToggleSelection(makeSelection(idx))}
                    className="w-full flex items-center justify-between rounded-lg px-3 py-2 transition-all"
                    disabled={usedByUser}
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

          {/* Max stake notice */}
          {card.maxStake != null && card.maxStake > 0 && (
            <p className="text-center text-[10px] mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
              {`Aposta máxima: R$ ${card.maxStake.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
            </p>
          )}

          {/* Already used indicator */}
          {usedByUser && (
            <div className="mt-2 text-center">
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white"
                style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)" }}>
                ✓ Já utilizado
              </span>
            </div>
          )}

          {/* Selected indicator */}
          {!usedByUser && isAnySelected && (
            <div className="mt-2 text-center">
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white"
                style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)" }}>
                ✓ Adicionado ao bilhete
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
