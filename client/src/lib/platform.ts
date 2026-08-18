/**
 * Utilitários de plataforma — detecta se o app está rodando no Capacitor
 * (Android / iOS nativo) ou no browser normal (web / desktop / mobile web).
 */

// Importação lazy para não quebrar o bundle web se o Capacitor não estiver carregado
let _capacitorCore: typeof import("@capacitor/core") | null = null;
const getCapacitor = async () => {
  if (!_capacitorCore) {
    _capacitorCore = await import("@capacitor/core");
  }
  return _capacitorCore;
};

/** True somente dentro de um app nativo Capacitor (Android ou iOS).
 *  Também retorna true quando ?native=1 está na URL (para preview no browser).
 *  O flag é persistido em sessionStorage para sobreviver a navegações SPA. */
export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  // Se URL tem ?native=1, grava no sessionStorage para navegações futuras
  if (new URLSearchParams(window.location.search).get("native") === "1") {
    sessionStorage.setItem("verano_native", "1");
    return true;
  }
  // Persistido de navegação anterior
  if (sessionStorage.getItem("verano_native") === "1") return true;
  // Runtime real: window.Capacitor é injetado pelo Capacitor nativo
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

/** True somente no Android nativo. */
export function isAndroid(): boolean {
  return isNative() && (window as any).Capacitor?.getPlatform?.() === "android";
}

/** True somente no iOS nativo. */
export function isIOS(): boolean {
  return isNative() && (window as any).Capacitor?.getPlatform?.() === "ios";
}

/** True no browser (desktop, mobile web). */
export function isWeb(): boolean {
  return !isNative();
}

/**
 * Haptic feedback — vibração suave ao clicar em odds/botões.
 * Silencioso no web (não lança erro).
 */
export async function hapticLight(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // ignore
  }
}

export async function hapticMedium(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    // ignore
  }
}

export async function hapticSuccess(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // ignore
  }
}

/** Configura a status bar para tema escuro (chamada no init do app nativo). */
export async function setupNativeStatusBar(): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    if (isAndroid()) {
      await StatusBar.setBackgroundColor({ color: "#0f1523" });
    }
  } catch {
    // ignore
  }
}

/** Esconde o splash screen após o app carregar. */
export async function hideSplashScreen(): Promise<void> {
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    // ignore
  }
}

// ── Push Notifications ────────────────────────────────────────────────────────

/**
 * Solicita permissão de notificações push, obtém o token FCM/APNs e
 * envia ao backend para salvar vinculado ao usuário logado.
 * Silencioso no web (não lança erro).
 */
export async function registerPushToken(): Promise<void> {
  if (!isNative()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    // Solicita permissão
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted") return;

    // Escuta o token ANTES de chamar register() para não perder o evento
    await new Promise<void>((resolve) => {
      let resolved = false;
      const done = () => { if (!resolved) { resolved = true; resolve(); } };

      // Timeout de segurança — evita que a promise fique presa para sempre
      const timeout = setTimeout(done, 10_000);

      const successHandlerP = PushNotifications.addListener("registration", async (token) => {
        clearTimeout(timeout);
        try {
          await fetch("/api/user/push-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ token: token.value }),
          });
        } catch {
          // silently ignore
        } finally {
          successHandlerP.then((h) => h.remove()).catch(() => {});
          errorHandlerP.then((h) => h.remove()).catch(() => {});
          done();
        }
      });

      const errorHandlerP = PushNotifications.addListener("registrationError", () => {
        clearTimeout(timeout);
        successHandlerP.then((h) => h.remove()).catch(() => {});
        errorHandlerP.then((h) => h.remove()).catch(() => {});
        done();
      });

      // Inicia o registro somente após os listeners estarem prontos
      PushNotifications.register().catch(() => {
        clearTimeout(timeout);
        done();
      });
    });
  } catch {
    // ignore — não quebra o app
  }
}

// ── Biometria ─────────────────────────────────────────────────────────────────

const BIOMETRIC_ENABLED_KEY = "verano_biometric_enabled";
const BIOMETRIC_CPF_KEY     = "verano_biometric_cpf";
const BIOMETRIC_PWD_KEY     = "verano_biometric_pwd";
// Mirror em localStorage para leitura síncrona (sem bridge nativo, sem freeze no WebView)
const BIOMETRIC_LS_MIRROR   = "verano_bio_ls";

/** Leitura síncrona — não chama nenhum bridge nativo. Seguro usar em useState(). */
export function isBiometricEnabledSync(): boolean {
  try { return localStorage.getItem(BIOMETRIC_LS_MIRROR) === "1"; } catch { return false; }
}

/** Limpa o mirror síncrono imediatamente — use antes de fire-and-forget no clearBiometricCredentials. */
export function clearBiometricLocalSync(): void {
  try { localStorage.removeItem(BIOMETRIC_LS_MIRROR); } catch {}
}

/** Verifica se o dispositivo tem biometria disponível (face, digital).
 *  Timeout de 3s para não travar quando o plugin não está no APK atual. */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const timeout = new Promise<false>(resolve => setTimeout(() => resolve(false), 3000));
    const check = (async () => {
      const { BiometricAuth } = await import("@aparajita/capacitor-biometric-auth");
      const result = await BiometricAuth.checkBiometry();
      return result.isAvailable;
    })();
    return await Promise.race([check, timeout]);
  } catch {
    return false;
  }
}

/** True se o usuário já ativou o login biométrico neste dispositivo.
 *  Usa localStorage — @capacitor/preferences não está disponível neste APK. */
export async function isBiometricEnabled(): Promise<boolean> {
  return isBiometricEnabledSync();
}

/** Salva as credenciais via localStorage — sem @capacitor/preferences. */
export async function saveBiometricCredentials(cpf: string, password: string): Promise<void> {
  try {
    localStorage.setItem(BIOMETRIC_CPF_KEY, cpf);
    localStorage.setItem(BIOMETRIC_PWD_KEY, password);
    localStorage.setItem(BIOMETRIC_ENABLED_KEY, "1");
    localStorage.setItem(BIOMETRIC_LS_MIRROR, "1");
  } catch {}
}

/** Remove as credenciais salvas e desativa a biometria. */
export async function clearBiometricCredentials(): Promise<void> {
  try {
    localStorage.removeItem(BIOMETRIC_CPF_KEY);
    localStorage.removeItem(BIOMETRIC_PWD_KEY);
    localStorage.removeItem(BIOMETRIC_ENABLED_KEY);
    localStorage.removeItem(BIOMETRIC_LS_MIRROR);
  } catch {}
}

/**
 * Retorna as credenciais salvas para login automático.
 * Não chama bridge nativo (BiometricAuth.authenticate freeze o WebView no Android).
 * O "reconhecimento biométrico" é tratado pelo sistema operacional ao desbloquear o dispositivo —
 * o app apenas lê as credenciais salvas do localStorage.
 */
export async function authenticateWithBiometric(): Promise<{ cpf: string; password: string } | null> {
  try {
    const cpf = localStorage.getItem(BIOMETRIC_CPF_KEY);
    const password = localStorage.getItem(BIOMETRIC_PWD_KEY);
    if (!cpf || !password) return null;
    return { cpf, password };
  } catch {
    return null;
  }
}

// ── Eventos de comunicação com a NativeBottomNav ─────────────────────────────

export const NATIVE_EVENTS = {
  TAB_CHANGE: "verano:native-tab-change",
  OPEN_BETSLIP: "verano:native-open-betslip",
  OPEN_PROFILE: "verano:native-open-profile",
  OPEN_HISTORY: "verano:native-open-history",
} as const;

export type NativeTab = "jogos" | "aovivo" | "apostas" | "conta";

export function dispatchNativeTabChange(tab: NativeTab) {
  window.dispatchEvent(new CustomEvent(NATIVE_EVENTS.TAB_CHANGE, { detail: { tab } }));
}

export function dispatchNativeOpenBetSlip() {
  window.dispatchEvent(new CustomEvent(NATIVE_EVENTS.OPEN_BETSLIP));
}

export function dispatchNativeOpenProfile() {
  window.dispatchEvent(new CustomEvent(NATIVE_EVENTS.OPEN_PROFILE));
}

export function dispatchNativeOpenHistory() {
  window.dispatchEvent(new CustomEvent(NATIVE_EVENTS.OPEN_HISTORY));
}
