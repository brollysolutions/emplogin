package in.brollysolutions.attendance;

import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Hosts the Brolly Attendance web app in a WebView.
 *
 * The only thing done here beyond Capacitor's default is system-bar insets.
 * The app targets SDK 36, where Android enforces edge-to-edge and no longer
 * honours an opt-out, so the WebView is laid out behind the status and
 * navigation bars. Rather than teach the shared web layout about Android
 * system bars — it also has to run in a desktop browser — the content view is
 * padded here by exactly the inset the system reports.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
