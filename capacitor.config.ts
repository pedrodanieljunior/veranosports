import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.veranosports.app",
  appName: "Verano Sports",
  webDir: "dist/public",
  server: {
    // URL do servidor live — o APK carrega o site direto do servidor,
    // garantindo assets atualizados e conexão com a API.
    url: "https://c0a88dbc-e110-4d58-a504-c0b93756fa27-00-3cl5a4bsvf0dt.picard.replit.dev",
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#0f1523",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "Dark",
      backgroundColor: "#0f1523",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: "automatic",
    scrollEnabled: true,
  },
};

export default config;
