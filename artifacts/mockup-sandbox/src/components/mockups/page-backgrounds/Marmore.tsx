export function Marmore() {
  const marmoreBg = {
    background: `
      radial-gradient(ellipse at 20% 30%, rgba(147,197,253,0.35) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 70%, rgba(186,230,253,0.3) 0%, transparent 50%),
      radial-gradient(ellipse at 50% 10%, rgba(255,255,255,0.8) 0%, transparent 40%),
      linear-gradient(135deg, #f8fbff 0%, #e8f4ff 30%, #f0f8ff 60%, #dbeafe 100%)
    `,
  };

  const veinStyle = `
    .marble-vein {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none;
      overflow: hidden;
      z-index: 0;
    }
    .marble-vein::before {
      content: '';
      position: absolute;
      top: -20%; left: -10%;
      width: 120%; height: 140%;
      background: 
        linear-gradient(35deg, transparent 30%, rgba(147,197,253,0.15) 35%, transparent 40%),
        linear-gradient(125deg, transparent 40%, rgba(186,230,253,0.12) 45%, transparent 50%),
        linear-gradient(65deg, transparent 20%, rgba(96,165,250,0.08) 25%, transparent 30%),
        linear-gradient(155deg, transparent 55%, rgba(147,197,253,0.1) 60%, transparent 65%);
    }
  `;

  const cards = [
    { home: "Brasil", away: "Argentina", league: "Copa do Mundo", time: "19:00", h: "2.10", d: "3.40", a: "3.20" },
    { home: "Real Madrid", away: "Barcelona", league: "La Liga", time: "21:30", h: "1.85", d: "3.50", a: "4.10" },
    { home: "Man City", away: "Liverpool", league: "Premier League", time: "16:00", h: "2.00", d: "3.30", a: "3.80" },
  ];

  return (
    <div className="min-h-screen" style={{ ...marmoreBg, position: "relative" }}>
      <style>{veinStyle}</style>
      <div className="marble-vein" />

      <div style={{ background: "linear-gradient(135deg, #1565C0 0%, #0d47a1 100%)", padding: "12px 16px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, background: "linear-gradient(135deg, #d4960f, #7c4a00)", borderRadius: 6 }} />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>BetPro</span>
          <span style={{ marginLeft: "auto", color: "#ffe082", fontSize: 13, fontWeight: 600 }}>R$ 1.250,00</span>
        </div>
      </div>

      <div style={{ padding: "12px 16px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {["Em Alta", "Futebol", "NBA", "UFC"].map((tab, i) => (
            <div key={tab} style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: i === 0 ? "#1565C0" : "rgba(248,251,255,0.85)",
              color: i === 0 ? "#fff" : "#374151",
              border: i !== 0 ? "1px solid rgba(147,197,253,0.3)" : "none"
            }}>{tab}</div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {cards.map((c, i) => (
            <div key={i} style={{
              background: "linear-gradient(to bottom, rgba(255,255,255,0.95), rgba(219,234,254,0.75))",
              borderRadius: 12, padding: 14,
              boxShadow: "0 2px 16px rgba(21,101,192,0.07), inset 0 1px 0 rgba(255,255,255,0.9)",
              border: "1px solid rgba(147,197,253,0.35)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>⚽ {c.league}</span>
                <span style={{ fontSize: 11, color: "#1565C0", fontWeight: 600 }}>{c.time}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontWeight: 700, color: "#111827", fontSize: 14 }}>{c.home}</span>
                <span style={{ fontSize: 11, color: "#6b7280" }}>vs</span>
                <span style={{ fontWeight: 700, color: "#111827", fontSize: 14 }}>{c.away}</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {[["1", c.h], ["X", c.d], ["2", c.a]].map(([label, odd]) => (
                  <button key={label} style={{
                    flex: 1, padding: "7px 4px", borderRadius: 8,
                    border: "1px solid rgba(147,197,253,0.4)",
                    background: "linear-gradient(to bottom, #fff, #eff6ff)",
                    cursor: "pointer", textAlign: "center"
                  }}>
                    <div style={{ fontSize: 10, color: "#6b7280" }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1565C0" }}>{odd}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "8px 16px", zIndex: 10,
        background: "linear-gradient(135deg, #1565C0 0%, #0d47a1 100%)", display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>🎫 2 seleções • Odd: 7.14</span>
        <span style={{ color: "#ffe082", fontWeight: 700, fontSize: 13 }}>Apostar →</span>
      </div>
    </div>
  );
}
