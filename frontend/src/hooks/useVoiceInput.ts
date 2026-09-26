import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribe } from '../api';

export type VoiceState = 'idle' | 'recording' | 'transcribing';

const MAX_RECORDING_MS = 60_000;

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? '';
}

/** Record from the microphone and turn speech into text with Whisper on Groq. */
export function useVoiceInput(onText: (text: string) => void, onError: (message: string) => void) {
  const supported =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  const [state, setState] = useState<VoiceState>('idle');
  const recorder = useRef<MediaRecorder | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const callbacks = useRef({ onText, onError });
  callbacks.current = { onText, onError };

  const stop = useCallback(() => {
    clearTimeout(stopTimer.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (!supported || recorder.current?.state === 'recording') return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      callbacks.current.onError('Microphone access was denied.');
      return;
    }

    const mimeType = pickMimeType();
    const media = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const parts: Blob[] = [];
    media.ondataavailable = (e) => e.data.size && parts.push(e.data);
    media.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      const type = media.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(parts, { type });
      if (blob.size < 1_000) {
        setState('idle');
        return;
      }
      setState('transcribing');
      try {
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const { text } = await transcribe(blob, `speech.${ext}`);
        if (text) callbacks.current.onText(text);
        else callbacks.current.onError("Didn't catch that — try again a bit closer to the mic.");
      } catch (err) {
        callbacks.current.onError((err as Error).message);
      } finally {
        setState('idle');
      }
    };

    recorder.current = media;
    media.start();
    setState('recording');
    stopTimer.current = setTimeout(stop, MAX_RECORDING_MS);
  }, [stop, supported]);

  useEffect(() => () => stop(), [stop]);

  return { supported, state, start, stop };
}
