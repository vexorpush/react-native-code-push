package com.vexorpush.codepush

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import java.io.File
import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.vexorpush.codepush.Common.CURRENT_VERSION_CODE
import com.vexorpush.codepush.Common.DEFAULT_BUNDLE
import com.vexorpush.codepush.Common.PATH
import com.vexorpush.codepush.Common.VERSION
import com.vexorpush.codepush.SharedPrefs

private const val DEBUG_TAG = "VEXOR-CODEPUSH-DEBUG"

private fun shortValue(value: String?): String {
  if (value.isNullOrBlank()) return value ?: ""
  return if (value.length > 120) "...${value.takeLast(120)}" else value
}

/*
 * TurboReactPackage rather than BaseReactPackage, which does not exist before
 * React Native 0.75. On 0.75 and later TurboReactPackage is an empty deprecated
 * subclass of it, so this one name compiles unchanged on every version the SDK
 * supports and no consuming app needs a patch. Switch it over when 0.73 support
 * is dropped.
 */
@Suppress("DEPRECATION")
class VexorCodePush : TurboReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == VexorCodePushModule.NAME) {
      VexorCodePushModule(reactContext)
    } else {
      null
    }
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      val moduleInfos: MutableMap<String, ReactModuleInfo> = HashMap()
      val isTurboModule: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      moduleInfos[VexorCodePushModule.NAME] = ReactModuleInfo(
        VexorCodePushModule.NAME,
        VexorCodePushModule.NAME,
        false,  // canOverrideExistingModule
        false,  // needsEagerInit
        false,  // isCxxModule
        isTurboModule // isTurboModule
      )
      moduleInfos
    }
  }
  companion object {
    fun Context.getVersionCode(): String {
      return when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> {
          packageManager.getPackageInfo(
            packageName,
            PackageManager.PackageInfoFlags.of(0)
          ).longVersionCode.toString()
        }
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.P -> {
          @Suppress("DEPRECATION")
          packageManager.getPackageInfo(packageName, 0).longVersionCode.toString()
        }
        else -> {
          @Suppress("DEPRECATION")
          packageManager.getPackageInfo(packageName, 0).versionCode.toString()
        }
      }
    }
    fun bundleJS(context: Context, isHandleCrash: Boolean = true): String {
      if (isHandleCrash) {
        Thread.setDefaultUncaughtExceptionHandler(CrashHandler(context))
      }
      val sharedPrefs = SharedPrefs(context)
      val pathBundle = sharedPrefs.getString(PATH)
      val version = sharedPrefs.getString(VERSION)
      val currentVersionName = sharedPrefs.getString(CURRENT_VERSION_CODE)
      val hasBundlePath = !pathBundle.isNullOrBlank()
      val isSameAppVersion = currentVersionName == context.getVersionCode()
      val bundleFileExists = hasBundlePath && File(pathBundle!!).isFile
      Log.d(
        DEBUG_TAG,
        "bundleJS path=${shortValue(pathBundle)} version=$version storedAppVersion=$currentVersionName appVersion=${context.getVersionCode()} hasPath=$hasBundlePath sameAppVersion=$isSameAppVersion fileExists=$bundleFileExists"
      )

      if (!hasBundlePath || !isSameAppVersion || !bundleFileExists) {
        if (pathBundle != "") {
          sharedPrefs.putString(PATH, "")
        }
        if (version != "") {
          // reset version number because bundle is wrong version, need download from new version
          sharedPrefs.putString(VERSION, "")
        }
        Log.d(DEBUG_TAG, "bundleJS result=default")
        return DEFAULT_BUNDLE
      }
      Log.d(DEBUG_TAG, "bundleJS result=ota path=${shortValue(pathBundle)} version=$version")
      return pathBundle!!
    }
  }
}
