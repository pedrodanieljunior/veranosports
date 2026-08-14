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

/** True somente dentro de um app nativo Capacitor (Android ou iOS). */
export function isNative(): boolean {
  // window.Capacitor é injetado pelo runtime nativo
  return typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();
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
