import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const KEY = 'modex.diagnostics.v1';
const LIMIT = 10;

export type DiagnosticKind = 'fatal JavaScript error' | 'React render error' | 'unhandled promise' | 'unexpected app error';
export type DiagnosticEntry = {
  id: string;
  time: string;
  kind: DiagnosticKind;
  platform: string;
  name: string;
  message: string;
  stack: string;
  componentStack?: string;
};

let writes: Promise<void> = Promise.resolve();

function safeText(value: unknown, limit: number): string {
  try { return String(value ?? '').slice(0, limit); } catch { return '[unavailable]'; }
}

function makeEntry(error: unknown, kind: DiagnosticKind, componentStack?: string): DiagnosticEntry {
  const value = error && typeof error === 'object' ? error as { name?: unknown; message?: unknown; stack?: unknown } : null;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    time: new Date().toISOString(),
    kind,
    platform: `${Platform.OS} ${safeText(Platform.Version, 80)}`,
    name: safeText(value?.name || 'Error', 120),
    message: safeText(value?.message ?? error, 2000),
    stack: safeText(value?.stack || 'No JavaScript stack was available.', 12000),
    ...(componentStack ? { componentStack: safeText(componentStack, 4000) } : {}),
  };
}

async function readStored(): Promise<DiagnosticEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((entry): entry is DiagnosticEntry =>
      !!entry && typeof entry === 'object' && typeof entry.id === 'string' && typeof entry.message === 'string'
    ).slice(0, LIMIT) : [];
  } catch { return []; }
}

export function recordDiagnostic(error: unknown, kind: DiagnosticKind, componentStack?: string): DiagnosticEntry {
  const entry = makeEntry(error, kind, componentStack);
  writes = writes.then(async () => {
    try {
      const previous = await readStored();
      await AsyncStorage.setItem(KEY, JSON.stringify([entry, ...previous].slice(0, LIMIT)));
    } catch { /* Reporting must never become another app error. */ }
  });
  return entry;
}

export async function listDiagnostics(): Promise<DiagnosticEntry[]> {
  await writes;
  return readStored();
}

export async function clearDiagnostics(): Promise<void> {
  writes = writes.then(async () => { try { await AsyncStorage.removeItem(KEY); } catch {} });
  await writes;
}

export function formatDiagnostic(entry: DiagnosticEntry): string {
  return [
    `Modex ${entry.kind} · ${entry.time}`,
    `Platform: ${entry.platform}`,
    `${entry.name}: ${entry.message}`,
    entry.stack,
    entry.componentStack ? `React component stack:\n${entry.componentStack}` : '',
  ].filter(Boolean).join('\n\n');
}
