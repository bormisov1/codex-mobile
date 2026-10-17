import { useEffect } from 'react';

const files = new Map<string, Blob>();
const recognitionEvents = new EventTarget();
let recognition: any;

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const FileSystem = {
  cacheDirectory: 'browser-cache:',
  EncodingType: { Base64: 'base64' },
  async readAsStringAsync(uri: string) {
    const response = await fetch(uri);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  },
  async writeAsStringAsync(uri: string, content: string) {
    files.set(uri, new Blob([content], { type: 'text/markdown' }));
  },
  async downloadAsync(url: string, uri: string) {
    const response = await fetch(url, { credentials: 'include' });
    if (response.ok) files.set(uri, await response.blob());
    return { uri, status: response.status };
  },
};

export const Sharing = {
  async shareAsync(uri: string, options?: { mimeType?: string; dialogTitle?: string }) {
    const blob = files.get(uri);
    if (!blob) throw new Error('File is unavailable');
    const name = decodeURIComponent(uri.split('/').at(-1) || uri.split(':').at(-1) || 'download');
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], name, { type: options?.mimeType || blob.type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: options?.dialogTitle });
        return;
      }
    }
    downloadBlob(blob, name);
  },
};

export const Notifications = {
  setNotificationHandler() {},
  async requestPermissionsAsync() {
    if (!('Notification' in window)) return { granted: false };
    return { granted: (await Notification.requestPermission()) === 'granted' };
  },
  async scheduleNotificationAsync(options: { content: { title: string; body: string } }) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(options.content.title, { body: options.content.body });
    }
  },
};

function emit(type: string, value: object = {}) {
  recognitionEvents.dispatchEvent(new CustomEvent(type, { detail: value }));
}

export const ExpoSpeechRecognitionModule = {
  async requestPermissionsAsync() {
    return { granted: !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) };
  },
  start(options: { lang: string; interimResults: boolean; continuous: boolean }) {
    const Constructor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Constructor) throw new Error('Speech recognition is unavailable in this browser');
    recognition = new Constructor();
    recognition.lang = options.lang;
    recognition.interimResults = options.interimResults;
    recognition.continuous = options.continuous;
    recognition.onstart = () => emit('start');
    recognition.onend = () => emit('end');
    recognition.onerror = (event: any) => emit('error', { error: event.error, message: event.message || event.error });
    recognition.onresult = (event: any) => {
      const result = event.results[event.resultIndex];
      emit('result', { results: [{ transcript: result?.[0]?.transcript || '' }], isFinal: !!result?.isFinal });
    };
    recognition.start();
  },
  stop() { recognition?.stop(); },
  abort() { recognition?.abort(); },
};

export function useSpeechRecognitionEvent(type: string, listener: (event: any) => void) {
  useEffect(() => {
    const handler = (event: Event) => listener((event as CustomEvent).detail);
    recognitionEvents.addEventListener(type, handler);
    return () => recognitionEvents.removeEventListener(type, handler);
  }, [type, listener]);
}
