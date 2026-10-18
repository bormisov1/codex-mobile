// React Native 0.86 installs a read-only native exception handler. Register a
// listener so the JavaScript message is saved before a TestFlight fatal error
// reaches RCTFatal (whose downloaded .crash omits the JavaScript stack).
if (!__DEV__ && typeof global.RN$registerExceptionListener === 'function') {
  const diagnostics = require('./src/diagnostics');
  let fatalShown = false;

  global.RN$registerExceptionListener(report => {
    if (!report?.isFatal) return;
    if (fatalShown) { report.preventDefault(); return; }
    fatalShown = true;

    const name = report.name || 'Error';
    const fullMessage = String(report.message || 'Unknown JavaScript error');
    const message = fullMessage.startsWith(`${name}: `) ? fullMessage.slice(name.length + 2) : fullMessage;
    const frames = Array.isArray(report.stack) ? report.stack.map(frame =>
      `at ${frame.methodName || '<unknown>'} (${frame.file || '<unknown>'}:${frame.lineNumber || 0}:${frame.column || 0})`
    ).join('\n') : '';
    const entry = diagnostics.recordDiagnostic({
      name,
      message,
      stack: report.extraData?.rawStack || frames || 'No JavaScript stack was available.',
    }, 'fatal JavaScript error', report.componentStack || undefined);
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
      report.preventDefault();
    } catch { /* Let React Native handle the fatal error if the alert cannot open. */ }
  });

  // Hermes installs this tracker only in development by default.
  try {
    global.HermesInternal?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id, rejection) => diagnostics.recordDiagnostic(rejection, 'unhandled promise'),
    });
  } catch {}
}

require('expo/AppEntry');
