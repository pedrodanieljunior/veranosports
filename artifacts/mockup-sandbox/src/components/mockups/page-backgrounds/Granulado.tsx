export function Granulado() {
  const grainStyle = `
    @keyframes grain {
      0%, 100% { transform: translate(0, 0); }
      10% { transform: translate(-1%, -1%); }
      20% { transform: translate(1%, 1%); }
      30% { transform: translate(-2%, 0); }
      40% { transform: translate(2%, -1%); }
      50% { transform: translate(-1%, 2%); }
      60% { transform: translate(1%, -2%); }
      70% { transform: translate(-2%, 1%); }
      80% { transform: translate(2%, 0); }
      90% { transform: translate(-1%, -2%); }
    }
    .grain-overlay::after {
      content: '';
      position: fixed;
      top: -150%;
      left: -150%;
      width: 400%;
      height: 400%;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E");
      opacity: 0.3;
      pointer-events: none;
      animation: grain 0.8s steps(1) infinite;
    }
  `;

  const cards = [
    { home: "Brasil", away: "Argentina", league: "Copa do Mundo", time: "19:00", h: "2.10", d: "3.40", a: "3.20" },
    { home: "Real Madrid", away: "Barcelona", league: "La Liga", time: "21:30", h: "1.85", d: "3.50", a: "4.10" },
    { home: "Man City", away: "Liverpool", league: "Premier League", time: "16:00", h: "2.00", d: "3.30", a: "3.80" },
  ];

  return (
    <div className="grain-overlay min-h-screen" style={{
      background: "linear-gradient(160deg, #e8eef8 0%, #d6e4f0 40%, #c9d8ed 100%)",
      position: "relative"
    }}>
      <style>{grainStyle}</style>

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
              background: i === 0 ? "#1565C0" : "rgba(255,255,255,0.7)",
              color: i === 0 ? "#fff" : "#374151",
            }}>{tab}</div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {cards.map((c, i) => (
            <div key={i} style={{
              background: "linear-gradient(to bottom, rgba(255,255,255,0.82), rgba(214,228,240,0.7))",
              borderRadius: 12, padding: 14, boxShadow: "0 1px 6px rgba(21,101,192,0.08)",
              border: "1px solid rgba(255,255,255,0.6)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "#4b5563", fontWeight: 500 }}>⚽ {c.league}</span>
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
                    flex: 1, padding: "7px 4px", borderRadius: 8, border: "1px solid rgba(147,197,253,0.5)",
                    background: "rgba(239,246,255,0.85)", cursor: "pointer", textAlign: "center"
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
