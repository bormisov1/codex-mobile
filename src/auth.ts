import { Buffer } from 'buffer';
import { originOf } from './model';

export type BasicCredentials = { username: string; password: string };
export type SavedConnection = {
  server: string;
  webuiPassword: string;
  basicUsername: string;
  basicPassword: string;
};

export function basicAuthorization(server: string, credentials?: BasicCredentials): string | undefined {
  if (!credentials || (!credentials.username && !credentials.password)) return undefined;
  if (!credentials.username || !credentials.password) throw new Error('Enter both proxy username and password.');
  if (credentials.username.includes(':')) throw new Error('Proxy username cannot contain a colon.');
  if (!originOf(server).startsWith('https://')) throw new Error('Proxy credentials require an HTTPS server URL.');
  return `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`, 'utf8').toString('base64')}`;
}
