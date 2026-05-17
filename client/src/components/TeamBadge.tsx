import { useState } from "react";
import { JerseyIcon } from "@/components/JerseyIcon";
import { proxyLogoUrl } from "@/lib/imgProxy";

const badgeCache: Record<string, string | null> = {};

async function fetchBadgeUrl(teamName: string): Promise<string | null> {
  if (teamName in badgeCache) return badgeCache[teamName];
  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(teamName)}`
    );
    const data = await res.json();
    const url = data?.teams?.[0]?.strBadge ?? null;
    badgeCache[teamName] = url;
    return url;
  } catch {
    badgeCache[teamName] = null;
    return null;
  }
}

interface TeamBadgeProps {
  teamName: string;
  logoUrl?: string;
  size?: number;
}

export function TeamBadge({ teamName, logoUrl, size = 24 }: TeamBadgeProps) {
  const proxied = proxyLogoUrl(logoUrl);
  const [badgeUrl, setBadgeUrl] = useState<string | null | undefined>(
    proxied ?? (teamName in badgeCache ? badgeCache[teamName] : undefined)
  );
  const [failed, setFailed] = useState(false);

  if (!proxied && badgeUrl === undefined) {
    fetchBadgeUrl(teamName).then(setBadgeUrl);
  }

  if (badgeUrl && !failed) {
    return (
      <img
        src={badgeUrl}
        alt={teamName}
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "contain" }}
        onError={() => setFailed(true)}
      />
    );
  }

  return <JerseyIcon teamName={teamName} size={size} />;
}
