export function Campo() {
  const DEV_DOMAIN = "c0a88dbc-e110-4d58-a504-c0b93756fa27-00-3cl5a4bsvf0dt.picard.replit.dev";
  const grassBg = {
    background: `
      linear-gradient(rgba(255,255,255,0.92), rgba(255,255,255,0.92)),
      repeating-linear-gradient(
        90deg,
        rgba(34, 120, 60, 0.12) 0px,
        rgba(34, 120, 60, 0.12) 40px,
        rgba(22, 100, 45, 0.06) 40px,
        rgba(22, 100, 45, 0.06) 80px
      )
    `,
  };

  const cards = [
    { home: "Brasil", away: "Argentina", league: "Copa do Mundo", time: "19:00", h: "2.10", d: "3.40", a: "3.20" },
    { home: "Real Madrid", away: "Barcelona", league: "La Liga", time: "21:30", h: "1.85", d: "3.50", a: "4.10" },
    { home: "Man City", away: "Liverpool", league: "Premier League", time: "16:00", h: "2.00", d: "3.30", a: "3.80" },
  ];

  return (
    <div className="min-h-screen" style={grassBg}>
      <div style={{ background: "linear-gradient(135deg, #1565C0 0%, #0d47a1 100%)", padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, background: "linear-gradient(135deg, #d4960f, #7c4a00)", borderRadius: 6 }} />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>BetPro</span>
          <span style={{ marginLeft: "auto", color: "#ffe082", fontSize: 13, fontWeight: 600 }}>R$ 1.250,00</span>
        </div>
      </div>

      <div style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {["Em Alta", "Futebol", "NBA", "UFC"].map((tab, i) => (
            <div key={tab} style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: i === 0 ? "#1565C0" : "#e5e7eb",
              color: i === 0 ? "#fff" : "#374151"
            }}>{tab}</div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {cards.map((c, i) => (
            <div key={i} style={{
              background: "linear-gradient(to bottom, #ffffff, #dbeafe)",
              borderRadius: 12, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              border: "1px solid rgba(147,197,253,0.4)"
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
                    flex: 1, padding: "7px 4px", borderRadius: 8, border: "1px solid #bfdbfe",
                    background: "#eff6ff", cursor: "pointer", textAlign: "center"
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

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "8px 16px",
        background: "linear-gradient(135deg, #1565C0 0%, #0d47a1 100%)", display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>🎫 2 seleções • Odd: 7.14</span>
        <span style={{ color: "#ffe082", fontWeight: 700, fontSize: 13 }}>Apostar →</span>
      </div>
    </div>
  );
}
