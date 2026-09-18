// Stable autolinking adapter for the generated NativeVexorCodePush provider.
#pragma once

#include "RNVexorCodePushSpec.h"

namespace facebook::react {

inline std::shared_ptr<TurboModule> VexorCodePush_ModuleProvider(
    const std::string &moduleName,
    const JavaTurboModule::InitParams &params) {
  return RNVexorCodePushSpec_ModuleProvider(moduleName, params);
}

} // namespace facebook::react
