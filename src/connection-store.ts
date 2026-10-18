import * as SecureStore from 'expo-secure-store';
import type { SavedConnection } from './auth';

const KEY = 'modex.connection.v1';
const OPTIONS = { keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY };

export async function loadConnection(): Promise<SavedConnection | null> {
  const value = await SecureStore.getItemAsync(KEY, OPTIONS);
  if (!value) return null;
  const saved = JSON.parse(value) as SavedConnection;
  return saved && typeof saved.server === 'string' ? saved : null;
}

export async function saveConnection(connection: SavedConnection): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(connection), OPTIONS);
}

export async function clearConnection(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
