#import <React/RCTReloadCommand.h>

#if defined(RCT_NEW_ARCH_ENABLED) && __has_include("RNVexorCodePushSpec.h")
#import "RNVexorCodePushSpec.h"
@interface VexorCodePush : NSObject <NativeVexorCodePushSpec>
#else
#import <React/RCTBridgeModule.h>
@interface VexorCodePush : NSObject <RCTBridgeModule>
#endif

+ (NSURL *)getBundle;

@end
