import {
  withMainApplication,
  withAppDelegate,
  IOSConfig,
} from '@expo/config-plugins';

const withAndroidAction: any = (config: any) => {
  return withMainApplication(config, (config) => {
    let content = config.modResults.contents;

    const isNewReactHost = content.includes('context = applicationContext');

    if (!content.includes('import com.vexorpush.codepush.VexorCodePush')) {
      content = content.replace(
        /import android.app.Application/g,
        `
import android.app.Application
import com.vexorpush.codepush.VexorCodePush`
      );
    }
    if (isNewReactHost) {
      if (!content.includes('VexorCodePush.bundleJS')) {
        content = content.replace(
          /context = applicationContext,/,
          `context = applicationContext,
      jsBundleFilePath = VexorCodePush.bundleJS(applicationContext),`
        );
      }

      config.modResults.contents = content;
      return config;
    }

    if (!content.includes('VexorCodePush.bundleJS(this@MainApplication)')) {
      content = content.replace(
        /DefaultReactNativeHost\s*\(this\)\s*\{/,
        `
          DefaultReactNativeHost(this) {

          override fun getJSBundleFile(): String = VexorCodePush.bundleJS(this@MainApplication)`
      );
    }

    config.modResults.contents = content;
    return config;
  });
};

const withIosAction: any = (config: any) => {
  return withAppDelegate(config, (config) => {
    const appDelegatePath = config.modRequest.projectRoot + '/ios/' + IOSConfig.Paths.getAppDelegateFilePath(config.modRequest.projectRoot);
    const isSwift = appDelegatePath.endsWith('.swift');

    if (isSwift) {
      // Swift: AppDelegate.swift
      if (!config.modResults.contents.includes('import react_native_code_push')) {
        config.modResults.contents = `import react_native_code_push\n${config.modResults.contents}`;
      }

      if (!config.modResults.contents.includes('VexorCodePush.getBundle()')) {
        config.modResults.contents = config.modResults.contents.replace(
          /return Bundle.main.url\(forResource: "main", withExtension: "jsbundle"\)/,
          `return VexorCodePush.getBundle()`
        );
      }
    } else {
      // Objective-C: AppDelegate.mm
      if (!config.modResults.contents.includes('#import "VexorCodePush.h')) {
        config.modResults.contents = config.modResults.contents.replace(
          /#import "AppDelegate.h"/g,
          `#import "AppDelegate.h"
#import "VexorCodePush.h"`
        );
      }

      config.modResults.contents = config.modResults.contents.replace(
        /\[\[NSBundle mainBundle\] URLForResource:@\"main\" withExtension:@\"jsbundle\"\]/,
        `[VexorCodePush getBundle]`
      );
    }

    return config;
  });
};

const withAction: any = (config: any) => {
  config = withAndroidAction(config);
  config = withIosAction(config);
  return config;
};

module.exports = withAction;
