import { Sport } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { translateLeagueName } from "@/lib/leagueTranslations";

interface SportsSidebarProps {
  sports: Sport[];
  selectedSport: string | null;
  onSelectSport: (sportKey: string) => void;
  isLoading: boolean;
}

export function SportsSidebar({ sports, selectedSport, onSelectSport, isLoading }: SportsSidebarProps) {
  if (isLoading) {
    return (
      <div className="w-64 flex flex-row h-full">
        <div className="w-1.5 flex-shrink-0" style={{ background: "linear-gradient(180deg, #f5c518 0%, #e8b206 50%, #d4960a 100%)" }} />
        <div className="flex-1 bg-white border-r border-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">&#9917;</span>
            <h2 className="font-bold text-gray-800 text-sm">Ligas de Futebol</h2>
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 flex flex-row h-full">
      <div className="w-1.5 flex-shrink-0" style={{ background: "linear-gradient(180deg, #f5c518 0%, #e8b206 50%, #d4960a 100%)" }} />
      <div className="flex-1 bg-white border-r border-gray-200 flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <span className="text-base">&#9917;</span>
          <h2 className="font-bold text-gray-700 text-sm">Ligas de Futebol</h2>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="py-1">
            {sports.map((sport) => (
              <button
                key={sport.key}
                onClick={() => onSelectSport(sport.key)}
                className={`w-full text-left px-4 py-2 text-[13px] transition-colors ${
                  selectedSport === sport.key
                    ? "bg-yellow-50 text-yellow-800 font-semibold border-l-[3px] border-l-yellow-500"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-800 border-l-[3px] border-l-transparent"
                }`}
                data-testid={`button-sport-${sport.key}`}
              >
                {translateLeagueName(sport.key, sport.title)}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
