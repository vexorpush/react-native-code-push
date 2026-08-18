package com.vexorpush.codepush

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.Toast
import com.jakewharton.processphoenix.ProcessPhoenix
import com.vexorpush.codepush.Common.PATH
import com.vexorpush.codepush.Common.VERSION
import com.vexorpush.codepush.Common.BUNDLE_HISTORY
import com.vexorpush.codepush.SharedPrefs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import java.io.File

private const val DEBUG_TAG = "VEXOR-CODEPUSH-DEBUG"

class CrashHandler(private val context: Context) : Thread.UncaughtExceptionHandler {
  private val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
  private val utils: Utils = Utils(context)
  private var beginning = true
  init {
    GlobalScope.launch(Dispatchers.IO) {
      delay(2000)
      beginning = false
    }
  }
  override fun uncaughtException(thread: Thread, throwable: Throwable) {
    if (!beginning) {
      defaultHandler?.uncaughtException(thread, throwable)
      return
    }

    try {
      handleStartupCrash(throwable)
    } catch (e: Throwable) {
      // Never let the recovery path swallow the original crash.
      Log.e(DEBUG_TAG, "crash handler failed while rolling back", e)
      defaultHandler?.uncaughtException(thread, throwable)
    }
  }

  private fun handleStartupCrash(throwable: Throwable) {
    Log.e(DEBUG_TAG, "crash during startup window, attempting bundle rollback", throwable)
    val sharedPrefs = SharedPrefs(context)
    val currentPath = sharedPrefs.getString(PATH)

    // Try to rollback using history system
    val historyJson = sharedPrefs.getString(BUNDLE_HISTORY)
    var rolledBack = false

    if (!historyJson.isNullOrEmpty() && !currentPath.isNullOrEmpty()) {
      try {
        val jsonArray = JSONArray(historyJson)
        val history = (0 until jsonArray.length()).map { i ->
          val obj = jsonArray.getJSONObject(i)
          Pair(obj.getInt("version"), obj.getString("path"))
        }.sortedByDescending { it.first }

        val currentBundle = history.find { it.second == currentPath }
        if (currentBundle != null) {
          val previousBundle = history
            .filter { it.first < currentBundle.first }
            .maxByOrNull { it.first }

          if (previousBundle != null && File(previousBundle.second).exists()) {
            val isDeleted = utils.deleteOldBundleIfneeded(PATH)
            if (isDeleted) {
              sharedPrefs.putString(PATH, previousBundle.second)
              sharedPrefs.putString(VERSION, previousBundle.first.toString())
              rolledBack = true
            }
          }
        }
      } catch (e: Exception) {
        // ignore, fall through to clear path
      }
    }

    if (!rolledBack) {
      sharedPrefs.putString(PATH, "")
    }

    val errorMessage = throwable.message ?: "Unknown error occurred"
    // Toast must be posted to the main looper: the crashing thread is often a
    // background thread with no looper, where Toast.show() throws and the
    // rollback below would never run.
    showToastOnMainThread("Update failed: $errorMessage")
    GlobalScope.launch(Dispatchers.IO) {
      delay(1500)
      ProcessPhoenix.triggerRebirth(context)
    }
  }

  private fun showToastOnMainThread(message: String) {
    try {
      if (Looper.myLooper() == Looper.getMainLooper()) {
        Toast.makeText(context, message, Toast.LENGTH_LONG).show()
      } else {
        Handler(Looper.getMainLooper()).post {
          try {
            Toast.makeText(context, message, Toast.LENGTH_LONG).show()
          } catch (e: Throwable) {
            Log.w(DEBUG_TAG, "unable to show rollback toast", e)
          }
        }
      }
    } catch (e: Throwable) {
      Log.w(DEBUG_TAG, "unable to show rollback toast", e)
    }
  }
}
