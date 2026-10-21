package app.dayweave.personal

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import app.tauri.annotation.*
import app.tauri.plugin.*
import java.io.File

@InvokeArg
class OpenOutputArgs { lateinit var path: String }

@TauriPlugin
class MobileFilesPlugin(private val activity: Activity) : Plugin(activity) {
  @Command
  fun pick(invoke: Invoke) {
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "*/*"
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    startActivityForResult(invoke, intent, "picked")
  }

  @ActivityCallback
  fun picked(invoke: Invoke, result: ActivityResult) {
    if (result.resultCode != Activity.RESULT_OK) {
      invoke.resolve(JSObject().put("file", org.json.JSONObject.NULL)); return
    }
    try {
      val uri = result.data?.data ?: throw IllegalArgumentException("未选择文件")
      var name = "产出文件"
      activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) name = cursor.getString(0) ?: name
      }
      invoke.resolve(JSObject().put("file", JSObject().put("uri", uri.toString()).put("name", name)))
    } catch (e: Exception) { invoke.reject(e.message ?: "无法读取所选文件") }
  }

  @Command
  fun open(invoke: Invoke) {
    try {
      val path = File(invoke.parseArgs(OpenOutputArgs::class.java).path).canonicalFile
      // Only application-private output copies may be shared with a viewer.
      val root = File(activity.filesDir, "outputs").canonicalFile
      if (!path.path.startsWith(root.path + File.separator) || !path.isFile) throw IllegalArgumentException("无法打开该文件")
      val uri = FileProvider.getUriForFile(activity, activity.packageName + ".fileprovider", path)
      val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(path.extension.lowercase()) ?: "application/octet-stream"
      val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      activity.startActivity(Intent.createChooser(intent, "打开任务产出"))
      invoke.resolve()
    } catch (e: ActivityNotFoundException) { invoke.reject("手机尚无可打开此文件的应用，可先保存到手机。") }
      catch (e: Exception) { invoke.reject(e.message ?: "打开失败，可先保存到手机。") }
  }
}
