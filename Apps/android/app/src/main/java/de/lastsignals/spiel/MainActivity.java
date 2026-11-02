package de.lastsignals.spiel;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * LAST SIGNALS: Querformat (Manifest), Vollbild ohne Status- und Navigationsleiste (immersiv, Wischen vom Rand
 * blendet die Leisten kurz ein). Die Kamera-Aussparung bleibt außerhalb des Spielbilds: Ab Android 15 (targetSdk 35+)
 * zeichnet jede App randlos, auch unter die Aussparung. Capacitor reicht die Ränder bei aktuellem WebView (ab 140) und
 * viewport-fit=cover nur als CSS env(safe-area-inset-*) an die Seite weiter, das Spiel-HUD beachtet sie nicht. Darum
 * rückt die Hülle das Spielbild selbst um die Aussparung (und die Tastatur) ein, unabhängig von der WebView-Version;
 * SystemBars.insetsHandling ist dafür in capacitor.config.json auf "disable" gestellt. Bildschirm bleibt an.
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
        // Spielbild aus der Kamera-Aussparung nehmen (schwarzer Rand wie auf dem iPhone), Tastatur schiebt von unten.
        // Status- und Navigationsleiste sind ausgeblendet und zählen nicht (beim kurzen Einblenden kein Springen).
        View decor = getWindow().getDecorView();
        decor.setBackgroundColor(0xFF000000);
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            Insets cut = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            int ime = insets.isVisible(WindowInsetsCompat.Type.ime()) ? insets.getInsets(WindowInsetsCompat.Type.ime()).bottom : 0;
            v.setPadding(cut.left, cut.top, cut.right, Math.max(cut.bottom, ime));
            // Ränder sind erledigt: der Seite keine zusätzlichen safe-area-Abstände melden
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
                .build();
        });
        ViewCompat.requestApplyInsets(decor);
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
