# Verano Sports — App Android & iOS (Capacitor)

## Como funciona

O Capacitor envolve o web app React existente numa "casca nativa".
**O site web continua funcionando normalmente** — o mesmo código gera:
- Site desktop (browser)
- Site mobile (browser no celular)
- App Android (Play Store)
- App iOS (App Store)

---

## Pré-requisitos

### Para Android
- Java JDK 17+
- Android Studio
- Android SDK (API 23+)

### Para iOS
- macOS com Xcode 14+
- CocoaPods (`sudo gem install cocoapods`)
- Conta de desenvolvedor Apple

---

## Fluxo de build

### 1. Build do web app + sync com nativo

```bash
npm run cap:build
```

Isso roda `npm run build` (Vite) e depois `npx cap sync`.

### 2. Abrir no Android Studio

```bash
npm run cap:android
```

No Android Studio:
- Clique em **Run ▶** para instalar no emulador ou dispositivo físico
- Para gerar APK/AAB: **Build → Generate Signed Bundle/APK**

### 3. Abrir no Xcode (macOS)

```bash
npm run cap:ios
```

No Xcode:
- Selecione o simulador ou dispositivo
- Clique em **Run ▶**
- Para publicar: **Product → Archive → Distribute App**

---

## Desenvolvimento com live reload

Para testar o app nativo com hot reload do servidor de dev:

1. Descubra o IP da sua máquina na rede local (`ipconfig` / `ifconfig`)
2. Em `capacitor.config.ts`, descomente e ajuste:
   ```ts
   server: {
     url: "http://192.168.x.x:5000",
     cleartext: true,
   }
   ```
3. Rode `npm run cap:sync`
4. Abra no Android Studio / Xcode e execute

---

## Variáveis detectadas no código

No React, use `isNative()` de `@/lib/platform` para comportamento específico do app:

```tsx
import { isNative, isAndroid, isIOS } from "@/lib/platform";

// Só no app nativo
if (isNative()) {
  // ex: mostrar bottom nav, haptic feedback, push notifications
}
```

---

## Push Notifications

A integração com Firebase (Android) / APNs (iOS) está configurada via `@capacitor/push-notifications`.
Para ativar:

1. **Android**: adicione `google-services.json` em `android/app/`
2. **iOS**: configure o certificado APNs no Xcode

---

## Estrutura dos projetos nativos

```
/
├── android/          ← Projeto Android Studio (gerado pelo Capacitor)
├── ios/              ← Projeto Xcode (gerado pelo Capacitor)
├── dist/public/      ← Build do web app (copiado pelo cap sync)
├── capacitor.config.ts
└── CAPACITOR.md      ← Este arquivo
```
