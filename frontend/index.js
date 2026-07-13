import { registerRootComponent } from 'expo';

import App from './App';

// ─── Global JS error handler (catch crashes avant ErrorBoundary) ───────────────
const previousHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  console.error(
    `[GlobalError] ${isFatal ? '💥 FATAL' : '⚠️  non-fatal'} : ${error?.message ?? error}`
  );
  console.error('[GlobalError] stack :', error?.stack ?? '(pas de stack)');
  if (previousHandler) previousHandler(error, isFatal);
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
