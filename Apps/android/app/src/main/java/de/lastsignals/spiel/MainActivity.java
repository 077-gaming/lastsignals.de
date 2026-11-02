package de.lastsignals.spiel;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * LAST SIGNALS: Querformat (Manifest), Vollbild ohne Status- und Navigationsleiste (immersiv, Wischen vom Rand
 * blendet die Leisten kurz ein). Die Kamera-Aussparung bleibt außerhalb des Spielbilds (Standardverhalten),
 * damit das HUD nie unter der Aussparung liegt. Bildschirm bleibt während des Spiels an.
 * Viewport wie im mobilen Browser: feste Layout-Breite aus dem Viewport-Meta des Spiels wird beachtet.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
            getWindow().setAttributes(lp);
        }
        // Das Spiel setzt auf Handys/Tablets eine feste Layout-Breite im Viewport-Meta (≥ 1360 px, verhältnisgleich
        // skaliert). Android-WebView beachtet die Breite nur mit „wide viewport“, sonst würde alles abgeschnitten.
        if (bridge != null && bridge.getWebView() != null) {
            WebSettings ws = bridge.getWebView().getSettings();
            ws.setUseWideViewPort(true);
            ws.setLoadWithOverviewMode(true);
            ws.setSupportZoom(false);
            ws.setBuiltInZoomControls(false);
            ws.setDisplayZoomControls(false);
            ws.setMediaPlaybackRequiresUserGesture(false);
        }
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    public void onResume() {
        super.onResume();
        hideSystemBars();
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.systemBars());
    }
}
