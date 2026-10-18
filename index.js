// TestFlight crash reports only show RCTFatal when a JavaScript exception reaches
// native code. Show the original message and stack before React Native aborts.
if (!__DEV__ && typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
  const previousHandler = global.RN$handleException;
  let fatalShown = false;
  const diagnostics = require('./src/diagnostics');

  // Hermes only installs this tracker in development. Keep a bounded local
  // record of unexpected rejections in TestFlight builds as well.
  try {
    global.HermesInternal?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id, rejection) => diagnostics.recordDiagnostic(rejection, 'unhandled promise'),
    });
  } catch {}

  global.RN$handleException = (error, isFatal, reportToConsole) => {
    if (!isFatal) return previousHandler?.(error, isFatal, reportToConsole) || false;
    if (fatalShown) return true;
    fatalShown = true;

    const entry = diagnostics.recordDiagnostic(error, 'fatal JavaScript error');
    const details = diagnostics.formatDiagnostic(entry);

    try {
      const { Alert, Share } = require('react-native');
      Alert.alert('Modex error', `${entry.name}: ${entry.message}`.slice(0, 1000), [
        { text: 'Copy details', onPress: () => {
          try { void require('expo-clipboard').setStringAsync(details).catch(() => {}); } catch {}
        } },
        { text: 'Share details', onPress: () => {
          try { void Share.share({ message: details }).catch(() => {}); } catch {}
        } },
        { text: 'Close' },
      ]);
      return true;
    } catch {
      return previousHandler?.(error, isFatal, reportToConsole) || false;
    }
  };
}

require('expo/AppEntry');
