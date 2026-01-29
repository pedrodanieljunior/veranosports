import { 
  Trophy, 
  Circle, 
  Target, 
  Dumbbell, 
  Zap,
  Star,
  Flame,
  Timer
} from "lucide-react";

interface SportIconProps {
  sport: string;
  className?: string;
}

export function SportIcon({ sport, className = "w-5 h-5" }: SportIconProps) {
  const sportLower = sport.toLowerCase();
  
  if (sportLower.includes("soccer") || sportLower.includes("futebol")) {
    return <Circle className={className} />;
  }
  if (sportLower.includes("football") || sportLower.includes("nfl")) {
    return <Zap className={className} />;
  }
  if (sportLower.includes("basketball") || sportLower.includes("nba")) {
    return <Target className={className} />;
  }
  if (sportLower.includes("tennis")) {
    return <Timer className={className} />;
  }
  if (sportLower.includes("mma") || sportLower.includes("boxing")) {
    return <Dumbbell className={className} />;
  }
  if (sportLower.includes("hockey")) {
    return <Star className={className} />;
  }
  
  return <Trophy className={className} />;
}
