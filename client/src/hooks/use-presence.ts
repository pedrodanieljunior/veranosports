import { useEffect } from "react";

let _clientId: string | null = null;
function getClientId(): string {
  if (!_clientId) {
    _clientId = localStorage.getItem("_presenceId") ?? null;
    if (!_clientId) {
      _clientId = crypto.randomUUID();
      localStorage.setItem("_presenceId", _clientId);
    }
  }
  return _clientId;
}

export function usePresence(page: string) {
  useEffect(() => {
    const clientId = getClientId();
    const send = () => {
      fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, page }),
      }).catch(() => {});
    };
    send();
    const interval = setInterval(send, 30_000);
    return () => clearInterval(interval);
  }, [page]);
}
