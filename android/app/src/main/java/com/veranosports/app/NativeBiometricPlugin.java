package com.veranosports.app;

import android.os.Handler;
import android.os.Looper;

import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

/**
 * Plugin biométrico nativo customizado.
 * Diferença do @aparajita/capacitor-biometric-auth: adiciona delay de 500ms
 * antes de chamar call.resolve(), dando tempo para o WebView recuperar o
 * controle do compositor antes do evaluateJavascript() ser executado.
 * Isso evita o freeze de toque que ocorre quando o callback nativo chega
 * enquanto o WebView ainda está retomando o foco após o dialog biométrico.
 */
@CapacitorPlugin(name = "NativeBiometric")
public class NativeBiometricPlugin extends Plugin {

    @PluginMethod
    public void authenticate(PluginCall call) {
        call.setKeepAlive(true);

        FragmentActivity activity = (FragmentActivity) getActivity();
        Executor executor = ContextCompat.getMainExecutor(activity);

        BiometricPrompt biometricPrompt = new BiometricPrompt(
            activity,
            executor,
            new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    super.onAuthenticationSucceeded(result);
                    // Delay de 500ms: dá tempo ao WebView de retomar o compositor
                    // antes do evaluateJavascript() ser chamado pelo Capacitor bridge
                    new Handler(Looper.getMainLooper()).postDelayed(() -> {
                        call.setKeepAlive(false);
                        call.resolve();
                    }, 500);
                }

                @Override
                public void onAuthenticationError(int errorCode, CharSequence errString) {
                    super.onAuthenticationError(errorCode, errString);
                    call.setKeepAlive(false);
                    call.reject(errString.toString(), String.valueOf(errorCode));
                }

                @Override
                public void onAuthenticationFailed() {
                    super.onAuthenticationFailed();
                    // Usuário tentou e falhou (ex: digital errada) — não rejeita,
                    // o sistema já mostra feedback e permite nova tentativa
                }
            }
        );

        BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
            .setTitle("Verano Sports")
            .setSubtitle("Confirme sua identidade para entrar")
            .setAllowedAuthenticators(
                androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK |
                androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
            )
            .setConfirmationRequired(false)
            .build();

        activity.runOnUiThread(() -> biometricPrompt.authenticate(promptInfo));
    }

    @PluginMethod
    public void checkAvailability(PluginCall call) {
        androidx.biometric.BiometricManager biometricManager =
            androidx.biometric.BiometricManager.from(getContext());

        int canAuthenticate = biometricManager.canAuthenticate(
            androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
        );

        com.getcapacitor.JSObject result = new com.getcapacitor.JSObject();
        result.put("available", canAuthenticate == androidx.biometric.BiometricManager.BIOMETRIC_SUCCESS);
        result.put("code", canAuthenticate);
        call.resolve(result);
    }
}
