'use client';

import { useCallback, useEffect, useState } from 'react';

// Озвучивание текста через встроенный в браузер Web Speech API — без
// серверных вызовов и затрат (см. CLAUDE.md, раздел "Подсказать"). Голос и
// его качество зависят от устройства/браузера, это осознанный компромисс
// вместо платного TTS.

const RATE_STORAGE_KEY = 'hint-tts-rate';
const VOICE_STORAGE_KEY = 'hint-tts-voice';
const DEFAULT_RATE = 0.55; // заметно медленнее обычной речи — так проще следить ребёнку

// Некоторые голоса читают кавычки буквально (например, произносят
// «кавычка» вслух) — раньше вырезали их только рядом с цифрами, но по
// прямому запросу владельца (28.08.2026) в разделе "Подсказать" кавычки
// не нужны вообще ни в каком виде, поэтому теперь убираем ЛЮБЫЕ кавычки
// из текста целиком (прямые/изогнутые/ёлочки), а не только у чисел.
function sanitizeForSpeech(text: string): string {
  return text.replace(/["'«»„”“]/g, '');
}

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURIState] = useState('');
  const [rate, setRateState] = useState(DEFAULT_RATE);
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (!isSupported) return;

    const storedRate = Number(localStorage.getItem(RATE_STORAGE_KEY));
    if (storedRate >= 0.5 && storedRate <= 1.5) setRateState(storedRate);
    const storedVoice = localStorage.getItem(VOICE_STORAGE_KEY);
    if (storedVoice) setVoiceURIState(storedVoice);

    function loadVoices() {
      // Голоса для русского языка — их набор зависит от устройства/браузера,
      // на некоторых их несколько (например, мужской/женский). Браузер иногда
      // отдаёт один и тот же голос дважды (одинаковое name) — оставляем
      // только первое вхождение каждого имени, иначе в списке дублируются
      // визуально неотличимые друг от друга варианты.
      const ruVoices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('ru'));
      const seenNames = new Set<string>();
      const uniqueVoices = ruVoices.filter((v) => {
        if (seenNames.has(v.name)) return false;
        seenNames.add(v.name);
        return true;
      });
      setVoices(uniqueVoices);
    }
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.cancel();
      window.speechSynthesis.onvoiceschanged = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  const speakWithOptions = useCallback(
    (text: string, opts?: { voiceURI?: string; rate?: number }) => {
      if (!isSupported || !text) return;
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(sanitizeForSpeech(text));
      utterance.lang = 'ru-RU';
      utterance.rate = opts?.rate ?? rate;
      const targetVoiceURI = opts?.voiceURI ?? voiceURI;
      const voice = voices.find((v) => v.voiceURI === targetVoiceURI);
      if (voice) utterance.voice = voice;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    },
    [isSupported, rate, voiceURI, voices]
  );

  const speak = useCallback((text: string) => speakWithOptions(text), [speakWithOptions]);

  // Проговаривает короткий образец выбранным голосом сразу при переключении
  // в настройках — чтобы сравнить голоса между собой не отдельным кликом.
  const previewVoice = useCallback(
    (uri: string) => speakWithOptions('Так звучит этот голос.', { voiceURI: uri }),
    [speakWithOptions]
  );

  const setVoiceURI = useCallback(
    (uri: string) => {
      setVoiceURIState(uri);
      if (isSupported) localStorage.setItem(VOICE_STORAGE_KEY, uri);
    },
    [isSupported]
  );

  const setRate = useCallback(
    (next: number) => {
      setRateState(next);
      if (isSupported) localStorage.setItem(RATE_STORAGE_KEY, String(next));
    },
    [isSupported]
  );

  return {
    speak,
    stop,
    isSpeaking,
    isSupported,
    voices,
    voiceURI,
    setVoiceURI,
    previewVoice,
    rate,
    setRate
  };
}
