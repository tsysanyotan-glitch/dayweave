package app.dayweave.personal

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import android.graphics.Color
import android.webkit.WebView

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
    // Keep controls outside system bars, cutouts and the software keyboard.
    val content = findViewById<android.view.View>(android.R.id.content)
    content.setBackgroundColor(Color.rgb(250, 251, 248))
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
      insets
    }
    ViewCompat.requestApplyInsets(content)
  }
}
