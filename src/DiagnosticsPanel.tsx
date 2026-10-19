import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearDiagnostics, formatDiagnostic, listDiagnostics } from './diagnostics';
import type { DiagnosticEntry } from './diagnostics';

export function DiagnosticsPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<DiagnosticEntry[]>([]);
  const insets = useSafeAreaInsets();
  useEffect(() => { if (visible) void listDiagnostics().then(setEntries); }, [visible]);
  const report = entries.map(formatDiagnostic).join('\n\n' + '─'.repeat(24) + '\n\n');
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}><Text style={styles.title}>Diagnostics</Text><Pressable accessibilityRole="button" onPress={onClose}><Text style={styles.link}>Close</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.note}>Recent app errors are kept on this device. Share a report when you want to send it. Check the text for private information first.</Text>
        {entries.length ? <>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => void Share.share({ message: report }).catch(() => {})}><Text style={styles.buttonText}>Share report</Text></Pressable>
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => void Clipboard.setStringAsync(report).catch(() => {})}><Text style={styles.buttonText}>Copy report</Text></Pressable>
          </View>
          {entries.map(entry => <View key={entry.id} style={styles.card}>
            <Text style={styles.kind}>{entry.kind} · {new Date(entry.time).toLocaleString()}</Text>
            <Text selectable style={styles.message}>{entry.name}: {entry.message}</Text>
            <Text selectable style={styles.stack}>{entry.stack}</Text>
            {!!entry.componentStack && <Text selectable style={styles.stack}>{entry.componentStack}</Text>}
          </View>)}
          <Pressable accessibilityRole="button" onPress={() => Alert.alert('Clear diagnostics?', 'Remove all saved app error reports from this device?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: () => { void clearDiagnostics().then(() => setEntries([])); } },
          ])}><Text style={styles.clear}>Clear saved reports</Text></Pressable>
        </> : <Text style={styles.empty}>No app errors have been saved yet.</Text>}
        <Text style={styles.note}>Native iOS crashes can close Modex before it can save a report here. Those reports are available through TestFlight.</Text>
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#121415' },
  header: { paddingHorizontal: 20, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#34393c' },
  title: { color: '#f4f5f5', fontSize: 22, fontWeight: '700' },
  link: { color: '#25c17e', fontSize: 16, padding: 6 },
  content: { padding: 20, paddingBottom: 50, gap: 16 },
  note: { color: '#9ba4a7', fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { backgroundColor: '#25c17e', padding: 12, borderRadius: 12 },
  buttonText: { color: '#10231a', fontWeight: '700' },
  card: { backgroundColor: '#1b1e20', borderColor: '#34393c', borderWidth: 1, borderRadius: 14, padding: 14, gap: 9 },
  kind: { color: '#25c17e', fontWeight: '700', fontSize: 13 },
  message: { color: '#f4f5f5', fontSize: 15 },
  stack: { color: '#9ba4a7', fontSize: 11, lineHeight: 16 },
  clear: { color: '#ef7779', paddingVertical: 12 },
  empty: { color: '#9ba4a7', textAlign: 'center', paddingVertical: 30 },
});
