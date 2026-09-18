> # ⚠️ Retired — do not use this repository
>
> The source of `@vexor-push/react-native-code-push` is
> **[vexorpush/codepush](https://github.com/vexorpush/codepush)**, in
> `packages/react-native-code-push`. Releases are published from there.
>
> This standalone repository stopped at **0.4.0**. Work towards 0.4.1 was
> started here on 2026-08-25, abandoned mid-change, and finished in the
> monorepo instead — it is preserved on the branch
> `wip/abandoned-2026-08-25` and was never released from here.
>
> Everything below describes 0.4.0 and is kept for history only. Editing this
> repository has no effect on the published package; that mistake is how the
> source ended up split across three places to begin with.

# @vexor-push/react-native-code-push

React Native CodePush SDK for Vexor Push. This package combines the app-facing CodePush wrapper and the native OTA bundle loader so mobile apps only install one Vexor package.

## Install

```bash
pnpm add @vexor-push/react-native-code-push
```

The SDK downloads, stores, and installs OTA bundles through the native `VexorCodePush` bridge. Apps do not need a separate downloader or file-system package.

## Configure

```ts
import {
  checkPendingUpdate,
  checkUpdate,
  configure,
  installUpdate,
  notifyApplicationReady,
  sync,
} from '@vexor-push/react-native-code-push';

configure({
  baseUrl: 'https://cp.example.com',
  deploymentKey: '<deployment-key-from-admin>',
  binaryVersion: '1.0.0',
  clientId: '<stable-device-or-install-id>',
});

await checkPendingUpdate();
await notifyApplicationReady();

const update = await checkUpdate();
if (update.hasUpdate) {
  await installUpdate(update);
}

await sync();
```

Pass a stable `clientId` for device/install metrics. If it is omitted, the SDK generates and stores one through the configured storage adapter.

## Native Loader

The package includes the Vexor native CodePush loader. Keep the standard native setup:

- iOS release builds should return `VexorCodePush.getBundle()`.
- Android release builds should return `VexorCodePush.bundleJS(applicationContext)`.
- Debug builds should keep using Metro.

## Manifest Endpoint

Preferred endpoint:

```text
GET https://cp.example.com/api/ota/key/:deploymentKey/update.json?currentVersion=0&platform=ios&binaryVersion=1.0.0
```

The SDK also supports app/deployment fallback configuration for debugging, but production apps should use deployment keys.
