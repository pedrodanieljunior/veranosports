const SESSION_KEY = "fw_session_id";

/**
 * Retorna o ID de sessão único deste usuário/navegador.
 * É criado automaticamente na primeira visita e persistido no localStorage.
 * Garante que cada usuário veja apenas seus próprios bilhetes.
 */
export function getSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}
