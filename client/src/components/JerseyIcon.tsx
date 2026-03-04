const TEAM_COLORS: Record<string, { primary: string; secondary: string; pattern?: "stripes" | "half" | "solid" }> = {
  "Arsenal": { primary: "#EF0107", secondary: "#FFFFFF", pattern: "solid" },
  "Aston Villa": { primary: "#670E36", secondary: "#95BFE5", pattern: "stripes" },
  "Brentford": { primary: "#E30613", secondary: "#FFFFFF", pattern: "stripes" },
  "Brighton": { primary: "#0057B8", secondary: "#FFFFFF", pattern: "stripes" },
  "Brighton and Hove Albion": { primary: "#0057B8", secondary: "#FFFFFF", pattern: "stripes" },
  "Burnley": { primary: "#6C1D45", secondary: "#99D6EA", pattern: "stripes" },
  "Chelsea": { primary: "#034694", secondary: "#FFFFFF", pattern: "solid" },
  "Crystal Palace": { primary: "#1B458F", secondary: "#C4122E", pattern: "stripes" },
  "Everton": { primary: "#003399", secondary: "#FFFFFF", pattern: "solid" },
  "Fulham": { primary: "#000000", secondary: "#FFFFFF", pattern: "solid" },
  "Ipswich Town": { primary: "#005EB8", secondary: "#FFFFFF", pattern: "solid" },
  "Leicester City": { primary: "#003090", secondary: "#FDBE11", pattern: "solid" },
  "Liverpool": { primary: "#C8102E", secondary: "#00B2A9", pattern: "solid" },
  "Manchester City": { primary: "#6CABDD", secondary: "#FFFFFF", pattern: "solid" },
  "Manchester United": { primary: "#DA020E", secondary: "#FBE122", pattern: "solid" },
  "Newcastle United": { primary: "#241F20", secondary: "#FFFFFF", pattern: "half" },
  "Nottingham Forest": { primary: "#DD0000", secondary: "#FFFFFF", pattern: "solid" },
  "Sheffield United": { primary: "#EE2737", secondary: "#000000", pattern: "stripes" },
  "Southampton": { primary: "#D71920", secondary: "#FFFFFF", pattern: "half" },
  "Tottenham Hotspur": { primary: "#132257", secondary: "#FFFFFF", pattern: "solid" },
  "Tottenham": { primary: "#132257", secondary: "#FFFFFF", pattern: "solid" },
  "West Ham United": { primary: "#7A263A", secondary: "#1BB1E7", pattern: "solid" },
  "Wolves": { primary: "#FDB913", secondary: "#231F20", pattern: "solid" },
  "Wolverhampton Wanderers": { primary: "#FDB913", secondary: "#231F20", pattern: "solid" },
  "Real Madrid": { primary: "#FFFFFF", secondary: "#00529F", pattern: "solid" },
  "Barcelona": { primary: "#A50044", secondary: "#004D98", pattern: "stripes" },
  "Atletico Madrid": { primary: "#CB3524", secondary: "#FFFFFF", pattern: "half" },
  "Sevilla": { primary: "#D71920", secondary: "#FFFFFF", pattern: "solid" },
  "Athletic Club": { primary: "#EE2523", secondary: "#FFFFFF", pattern: "stripes" },
  "Villarreal": { primary: "#FFD700", secondary: "#005090", pattern: "solid" },
  "Real Sociedad": { primary: "#0066B3", secondary: "#FFFFFF", pattern: "stripes" },
  "Bayern Munich": { primary: "#DC052D", secondary: "#FFFFFF", pattern: "solid" },
  "Borussia Dortmund": { primary: "#FDE100", secondary: "#000000", pattern: "solid" },
  "RB Leipzig": { primary: "#DD0741", secondary: "#FFFFFF", pattern: "solid" },
  "Bayer Leverkusen": { primary: "#E32221", secondary: "#000000", pattern: "solid" },
  "Juventus": { primary: "#000000", secondary: "#FFFFFF", pattern: "half" },
  "Inter Milan": { primary: "#010E80", secondary: "#000000", pattern: "stripes" },
  "AC Milan": { primary: "#FB090B", secondary: "#000000", pattern: "stripes" },
  "Napoli": { primary: "#12A0C3", secondary: "#FFFFFF", pattern: "solid" },
  "AS Roma": { primary: "#8E1F2F", secondary: "#F5C518", pattern: "solid" },
  "Lazio": { primary: "#87D8F7", secondary: "#FFFFFF", pattern: "solid" },
  "Fiorentina": { primary: "#4B0082", secondary: "#FFFFFF", pattern: "solid" },
  "PSG": { primary: "#004170", secondary: "#DA291C", pattern: "solid" },
  "Paris Saint-Germain": { primary: "#004170", secondary: "#DA291C", pattern: "solid" },
  "Olympique de Marseille": { primary: "#009CDE", secondary: "#FFFFFF", pattern: "solid" },
  "Olympique Lyonnais": { primary: "#FFFFFF", secondary: "#0033A0", pattern: "solid" },
  "Monaco": { primary: "#EE182D", secondary: "#FFFFFF", pattern: "half" },
  "Ajax": { primary: "#D2122E", secondary: "#FFFFFF", pattern: "half" },
  "Benfica": { primary: "#CF1921", secondary: "#FFFFFF", pattern: "solid" },
  "Porto": { primary: "#003DA6", secondary: "#FFFFFF", pattern: "solid" },
  "Sporting CP": { primary: "#006600", secondary: "#FFFFFF", pattern: "solid" },
  "Celtic": { primary: "#16A34A", secondary: "#FFFFFF", pattern: "stripes" },
  "Rangers": { primary: "#003B99", secondary: "#FFFFFF", pattern: "solid" },
  "Flamengo": { primary: "#CC0000", secondary: "#000000", pattern: "stripes" },
  "Palmeiras": { primary: "#006600", secondary: "#FFFFFF", pattern: "solid" },
  "Corinthians": { primary: "#000000", secondary: "#FFFFFF", pattern: "solid" },
  "São Paulo": { primary: "#FFFFFF", secondary: "#CC0000", pattern: "stripes" },
  "Grêmio": { primary: "#003087", secondary: "#87CEEB", pattern: "stripes" },
  "Internacional": { primary: "#CC0000", secondary: "#FFFFFF", pattern: "solid" },
  "Santos": { primary: "#FFFFFF", secondary: "#000000", pattern: "solid" },
  "Fluminense": { primary: "#990000", secondary: "#006600", pattern: "stripes" },
  "Atlético Mineiro": { primary: "#000000", secondary: "#FFFFFF", pattern: "half" },
  "Cruzeiro": { primary: "#003087", secondary: "#FFFFFF", pattern: "solid" },
  "Vasco da Gama": { primary: "#000000", secondary: "#FFFFFF", pattern: "half" },
  "Botafogo": { primary: "#000000", secondary: "#FFFFFF", pattern: "stripes" },
  "Athletico Paranaense": { primary: "#CC0000", secondary: "#000000", pattern: "solid" },
  "Bahia": { primary: "#003087", secondary: "#CC0000", pattern: "stripes" },
  "Fortaleza": { primary: "#003087", secondary: "#CC0000", pattern: "stripes" },
  "Ceará": { primary: "#000000", secondary: "#FFFFFF", pattern: "solid" },
};

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 38%)`;
}

function hashSecondary(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i + 1 || 0) + ((hash << 3) - hash);
  }
  const h = (Math.abs(hash) % 360 + 180) % 360;
  return `hsl(${h}, 60%, 80%)`;
}

function getTeamColors(teamName: string) {
  if (TEAM_COLORS[teamName]) return TEAM_COLORS[teamName];
  for (const [key, val] of Object.entries(TEAM_COLORS)) {
    if (
      teamName.toLowerCase().includes(key.toLowerCase()) ||
      key.toLowerCase().includes(teamName.toLowerCase())
    ) {
      return val;
    }
  }
  const patterns: ("solid" | "stripes" | "half")[] = ["solid", "stripes", "half"];
  let hash = 0;
  for (let i = 0; i < teamName.length; i++) hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
  return {
    primary: hashColor(teamName),
    secondary: hashSecondary(teamName),
    pattern: patterns[Math.abs(hash) % 3],
  };
}

interface JerseyIconProps {
  teamName: string;
  size?: number;
}

export function JerseyIcon({ teamName, size = 24 }: JerseyIconProps) {
  const { primary, secondary, pattern } = getTeamColors(teamName);
  const id = `jersey-${teamName.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {pattern === "stripes" && (
          <pattern id={`${id}-stripe`} x="0" y="0" width="3" height="24" patternUnits="userSpaceOnUse">
            <rect width="1.5" height="24" fill={primary} />
            <rect x="1.5" width="1.5" height="24" fill={secondary} />
          </pattern>
        )}
        {pattern === "half" && (
          <linearGradient id={`${id}-half`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="50%" stopColor={primary} />
            <stop offset="50%" stopColor={secondary} />
          </linearGradient>
        )}
        <clipPath id={`${id}-clip`}>
          <path d="M8 2 L4 6 L2 5 L1 9 L4 10 L4 22 L20 22 L20 10 L23 9 L22 5 L20 6 L16 2 C15 4 13 5 12 5 C11 5 9 4 8 2 Z" />
        </clipPath>
      </defs>

      {/* Jersey body */}
      <path
        d="M8 2 L4 6 L2 5 L1 9 L4 10 L4 22 L20 22 L20 10 L23 9 L22 5 L20 6 L16 2 C15 4 13 5 12 5 C11 5 9 4 8 2 Z"
        fill={pattern === "stripes" ? `url(#${id}-stripe)` : pattern === "half" ? `url(#${id}-half)` : primary}
        stroke="rgba(0,0,0,0.25)"
        strokeWidth="0.5"
      />

      {/* Collar */}
      <path
        d="M8 2 C9 4 11 5 12 5 C13 5 15 4 16 2"
        fill="none"
        stroke={secondary}
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Sleeve trim left */}
      <line x1="1" y1="9" x2="4" y2="10" stroke={secondary} strokeWidth="1.2" strokeLinecap="round" />
      {/* Sleeve trim right */}
      <line x1="23" y1="9" x2="20" y2="10" stroke={secondary} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
