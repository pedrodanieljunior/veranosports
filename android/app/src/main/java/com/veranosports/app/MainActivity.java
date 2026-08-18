package com.veranosports.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(NativeBiometricPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
