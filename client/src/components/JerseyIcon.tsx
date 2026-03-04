const TEAM_COLORS: Record<string, { primary: string; secondary: string }> = {
  "Arsenal": { primary: "#EF0107", secondary: "#FFFFFF" },
  "Aston Villa": { primary: "#95BFE5", secondary: "#670E36" },
  "Brentford": { primary: "#E30613", secondary: "#FFFFFF" },
  "Brighton": { primary: "#0057B8", secondary: "#FFFFFF" },
  "Brighton and Hove Albion": { primary: "#0057B8", secondary: "#FFFFFF" },
  "Burnley": { primary: "#6C1D45", secondary: "#99D6EA" },
  "Chelsea": { primary: "#034694", secondary: "#FFFFFF" },
  "Crystal Palace": { primary: "#1B458F", secondary: "#C4122E" },
  "Everton": { primary: "#003399", secondary: "#FFFFFF" },
  "Fulham": { primary: "#000000", secondary: "#FFFFFF" },
  "Ipswich Town": { primary: "#005EB8", secondary: "#FFFFFF" },
  "Leicester City": { primary: "#003090", secondary: "#FDBE11" },
  "Liverpool": { primary: "#C8102E", secondary: "#00B2A9" },
  "Manchester City": { primary: "#6CABDD", secondary: "#FFFFFF" },
  "Manchester United": { primary: "#DA020E", secondary: "#FBE122" },
  "Newcastle United": { primary: "#241F20", secondary: "#FFFFFF" },
  "Nottingham Forest": { primary: "#DD0000", secondary: "#FFFFFF" },
  "Sheffield United": { primary: "#EE2737", secondary: "#000000" },
  "Southampton": { primary: "#D71920", secondary: "#FFFFFF" },
  "Tottenham Hotspur": { primary: "#132257", secondary: "#FFFFFF" },
  "Tottenham": { primary: "#132257", secondary: "#FFFFFF" },
  "West Ham United": { primary: "#7A263A", secondary: "#1BB1E7" },
  "Wolves": { primary: "#FDB913", secondary: "#231F20" },
  "Wolverhampton Wanderers": { primary: "#FDB913", secondary: "#231F20" },
  "Real Madrid": { primary: "#FFFFFF", secondary: "#00529F" },
  "Barcelona": { primary: "#A50044", secondary: "#004D98" },
  "Atletico Madrid": { primary: "#CB3524", secondary: "#FFFFFF" },
  "Sevilla": { primary: "#D71920", secondary: "#FFFFFF" },
  "Athletic Club": { primary: "#EE2523", secondary: "#FFFFFF" },
  "Villarreal": { primary: "#FFD700", secondary: "#005090" },
  "Real Sociedad": { primary: "#0066B3", secondary: "#FFFFFF" },
  "Bayern Munich": { primary: "#DC052D", secondary: "#FFFFFF" },
  "Borussia Dortmund": { primary: "#FDE100", secondary: "#000000" },
  "RB Leipzig": { primary: "#DD0741", secondary: "#FFFFFF" },
  "Bayer Leverkusen": { primary: "#E32221", secondary: "#000000" },
  "Juventus": { primary: "#000000", secondary: "#FFFFFF" },
  "Inter Milan": { primary: "#010E80", secondary: "#000000" },
  "AC Milan": { primary: "#FB090B", secondary: "#000000" },
  "Napoli": { primary: "#12A0C3", secondary: "#FFFFFF" },
  "AS Roma": { primary: "#8E1F2F", secondary: "#F5C518" },
  "Lazio": { primary: "#87D8F7", secondary: "#FFFFFF" },
  "Fiorentina": { primary: "#4B0082", secondary: "#FFFFFF" },
  "PSG": { primary: "#004170", secondary: "#DA291C" },
  "Paris Saint-Germain": { primary: "#004170", secondary: "#DA291C" },
  "Olympique de Marseille": { primary: "#009CDE", secondary: "#FFFFFF" },
  "Olympique Lyonnais": { primary: "#FFFFFF", secondary: "#0033A0" },
  "Monaco": { primary: "#EE182D", secondary: "#FFFFFF" },
  "Ajax": { primary: "#D2122E", secondary: "#FFFFFF" },
  "Benfica": { primary: "#CF1921", secondary: "#FFFFFF" },
  "Porto": { primary: "#003DA6", secondary: "#FFFFFF" },
  "Sporting CP": { primary: "#006600", secondary: "#FFFFFF" },
  "Celtic": { primary: "#16A34A", secondary: "#FFFFFF" },
  "Rangers": { primary: "#003B99", secondary: "#FFFFFF" },
  "Flamengo": { primary: "#CC0000", secondary: "#000000" },
  "Palmeiras": { primary: "#006600", secondary: "#FFFFFF" },
  "Corinthians": { primary: "#000000", secondary: "#FFFFFF" },
  "São Paulo": { primary: "#FFFFFF", secondary: "#CC0000" },
  "Grêmio": { primary: "#003087", secondary: "#87CEEB" },
  "Internacional": { primary: "#CC0000", secondary: "#FFFFFF" },
  "Santos": { primary: "#FFFFFF", secondary: "#000000" },
  "Fluminense": { primary: "#990000", secondary: "#006600" },
  "Atlético Mineiro": { primary: "#000000", secondary: "#FFFFFF" },
  "Cruzeiro": { primary: "#003087", secondary: "#FFFFFF" },
  "Vasco da Gama": { primary: "#000000", secondary: "#FFFFFF" },
  "Botafogo": { primary: "#000000", secondary: "#FFFFFF" },
  "Athletico Paranaense": { primary: "#CC0000", secondary: "#000000" },
  "Bahia": { primary: "#003087", secondary: "#CC0000" },
  "Fortaleza": { primary: "#003087", secondary: "#CC0000" },
  "Ceará": { primary: "#000000", secondary: "#FFFFFF" },
};

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 65%, 40%)`;
}

function getTeamColors(teamName: string) {
  if (TEAM_COLORS[teamName]) return TEAM_COLORS[teamName];
  for (const [key, val] of Object.entries(TEAM_COLORS)) {
    if (teamName.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(teamName.toLowerCase())) {
      return val;
    }
  }
  return { primary: hashColor(teamName), secondary: "#FFFFFF" };
}

interface JerseyIconProps {
  teamName: string;
  size?: number;
}

export function JerseyIcon({ teamName, size = 24 }: JerseyIconProps) {
  const { primary, secondary } = getTeamColors(teamName);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 2 L4 6 L2 5 L1 9 L4 10 L4 22 L20 22 L20 10 L23 9 L22 5 L20 6 L16 2 C15 4 13 5 12 5 C11 5 9 4 8 2 Z"
        fill={primary}
        stroke={secondary}
        strokeWidth="0.8"
      />
      <path
        d="M8 2 C9 4 11 5 12 5 C13 5 15 4 16 2"
        fill={secondary}
        stroke={secondary}
        strokeWidth="0.5"
      />
    </svg>
  );
}
