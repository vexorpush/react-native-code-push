package com.vexorpush.codepush

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.util.Log

private const val DEBUG_TAG = "VEXOR-CODEPUSH-DEBUG"

private fun shortValue(value: String?): String {
    if (value.isNullOrBlank()) return value ?: ""
    return if (value.length > 120) "...${value.takeLast(120)}" else value
}

class SharedPrefs internal constructor(context: Context) {
    private val mSharedPreferences: SharedPreferences =
        context.getSharedPreferences(Common.SHARED_PREFERENCE_NAME, Context.MODE_PRIVATE)

    fun getString(key: String?): String? {
        return mSharedPreferences.getString(key, "")
    }

    @SuppressLint("CommitPrefEdits")
    fun putString(key: String?, value: String?) {
        val editor = mSharedPreferences.edit()
        editor.putString(key, value)
        val committed = editor.commit()
        if (key == Common.PATH || key == Common.VERSION || key == Common.CURRENT_VERSION_CODE) {
            Log.d(DEBUG_TAG, "SharedPrefs.putString key=$key value=${shortValue(value)} committed=$committed")
        }
    }

    fun getInt(key: String?, defaultValue: Int): Int {
        return mSharedPreferences.getInt(key, defaultValue)
    }

    fun putInt(key: String?, value: Int) {
        val editor = mSharedPreferences.edit()
        editor.putInt(key, value)
        val committed = editor.commit()
        Log.d(DEBUG_TAG, "SharedPrefs.putInt key=$key value=$value committed=$committed")
    }

    fun clear() {
        val committed = mSharedPreferences.edit().clear().commit()
        Log.d(DEBUG_TAG, "SharedPrefs.clear committed=$committed")
    }
}
object Common {
    val PATH = "PATH"
    val PREVIOUS_PATH = "PREVIOUS_PATH"
    val VERSION = "VERSION"
    val PREVIOUS_VERSION = "PREVIOUS_VERSION"
    val CURRENT_VERSION_CODE = "CURRENT_VERSION_CODE"
    val SHARED_PREFERENCE_NAME = "VEXOR-CODE-PUSH-REACT_NATIVE"
    val DEFAULT_BUNDLE = "assets://index.android.bundle"
    val METADATA = "METADATA"
    val BUNDLE_HISTORY = "BUNDLE_HISTORY"
    const val DEFAULT_MAX_BUNDLE_VERSIONS = 2
}
