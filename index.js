// TestFlight crash reports only show RCTFatal when a JavaScript exception reaches
// native code. Show the original message and stack before React Native aborts.
if (!__DEV__ && typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
  const previousHandler = global.RN$handleException;
  let fatalShown = false;

  global.RN$handleException = (error, isFatal, reportToConsole) => {
    if (!isFatal) return previousHandler?.(error, isFatal, reportToConsole) || false;
    if (fatalShown) return true;
    fatalShown = true;

    const name = error?.name || 'Error';
    const message = error?.message || String(error);
    const details = [
      `Modex fatal JavaScript error · ${new Date().toISOString()}`,
      `${name}: ${message}`,
      error?.stack || 'No JavaScript stack was available.',
    ].join('\n\n');

    try {
      const { Alert, Share } = require('react-native');
      Alert.alert('Modex error', `${name}: ${message}`.slice(0, 1000), [
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
