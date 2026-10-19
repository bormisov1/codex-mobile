import type { SavedConnection } from './auth';

export async function loadConnection(): Promise<SavedConnection | null> { return null; }
export async function saveConnection(_connection: SavedConnection): Promise<void> { /* Browser preview uses its own origin and does not persist credentials. */ }
export async function clearConnection(): Promise<void> { /* No credentials are persisted in the browser preview. */ }
