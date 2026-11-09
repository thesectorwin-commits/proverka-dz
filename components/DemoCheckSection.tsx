'use client';

import { useState } from 'react';
import CheckResultView, { CheckTask } from '@/components/CheckResultView';
import PhotoModal from '@/components/PhotoModal';

type DemoResult = {
  grade: number | null;
  generalComment: string;
  tasks: CheckTask[];
  photoUrl: string;
};

const LOADING_MESSAGES = ['Проверяю примеры…', 'Считаю в столбик…', 'Сверяю ответы…', 'Ищу помарки красной ручкой…'];

// Облегчённая копия (1000 px, ~110 КБ) только для показа; оригинал 2,2 МБ нужен лишь самой проверке (см. app/api/checks/demo/route.ts).
const DEMO_PHOTO_URL = '/demo/demo-photo-web.jpg';

// Живая демонстрация проверки на главной странице — без своего фото,
// кнопка реально отправляет заранее подготовленное фото (public/demo/)
// на /api/checks/demo и показывает настоящий результат модели, тот же
// компонент CheckResultView, что и в обычной проверке.
export default function DemoCheckSection() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(LOADING_MESSAGES[0]);
  // Фото одно и то же в обоих состояниях (до/после проверки) — модалка
  // открывает его по клику, тот же компонент, что и в истории проверок.
  const [photoModalOpen, setPhotoModalOpen] = useState(false);

  async function runDemo() {
    setLoading(true);
    setError(null);
    setResult(null);

    let messageIndex = 0;
    setLoadingMessage(LOADING_MESSAGES[0]);
    const timer = setInterval(() => {
      messageIndex = (messageIndex + 1) % LOADING_MESSAGES.length;
      setLoadingMessage(LOADING_MESSAGES[messageIndex]);
    }, 1800);

    try {
      const res = await fetch('/api/checks/demo', { method: 'POST' });
      const bodyText = await res.text();
      let data: any;
      try {
        data = JSON.parse(bodyText);
      } catch {
        throw new Error('Демо-проверка заняла слишком много времени, попробуйте ещё раз');
      }
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось запустить демо-проверку');
      }
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Что-то пошло не так');
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }

  return (
    <section className="max-w-[620px] mx-auto mb-10">
      <div>
        <h2 className="font-extrabold text-xl text-ink text-center mb-4">Посмотрите, как работает проверка</h2>

        {!result && (
          <div className="text-center mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={DEMO_PHOTO_URL}
              decoding="async"
              alt="Пример страницы с заданиями по математике"
              onClick={() => setPhotoModalOpen(true)}
              className="inline-block max-w-full max-h-[200px] rounded border-4 border-white shadow-lg shadow-ink/10 rotate-[-1deg] cursor-pointer"
            />
          </div>
        )}

        {!result && !loading && (
          <>
            <p className="text-sm text-inkSoft text-center mb-4 max-w-[42ch] mx-auto">
              Нажмите кнопку ниже — сервис проверит фотографию и покажет результат проверки.
            </p>
            <button
              type="button"
              onClick={runDemo}
              className="block w-full max-w-[320px] mx-auto bg-greenCheck text-white font-extrabold text-base rounded-full px-5 py-3 shadow-[0_6px_16px_rgba(46,158,99,0.4)]"
            >
              Запустить демо-проверку
            </button>
          </>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-3 py-6 text-inkSoft font-bold">
            <span
              className="w-[22px] h-[22px] rounded-full border-[3px] border-gridLine border-t-pencilOrange animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span>{loadingMessage}</span>
          </div>
        )}

        {error && !loading && (
          <div className="bg-redPenSoft text-[#7A1E29] rounded-xl px-4 py-3.5 text-[14.5px] leading-relaxed mb-2">
            {error}
          </div>
        )}

        {error && !loading && (
          <button
            type="button"
            onClick={runDemo}
            className="block w-full max-w-[320px] mx-auto mt-3 bg-white border border-ink/15 text-ink font-bold text-sm rounded-full px-5 py-2.5 shadow-sm"
          >
            Попробовать снова
          </button>
        )}

        {result && !loading && (
          <>
            <div className="text-center mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.photoUrl}
                alt="Проверенная демо-страница"
                onClick={() => setPhotoModalOpen(true)}
                className="inline-block max-w-full max-h-[200px] rounded border-4 border-white shadow-lg shadow-ink/10 rotate-[-1deg] cursor-pointer"
              />
            </div>
            <CheckResultView grade={result.grade} generalComment={result.generalComment} tasks={result.tasks} />
          </>
        )}
      </div>

      {photoModalOpen && (
        <PhotoModal
          src={result?.photoUrl || DEMO_PHOTO_URL}
          onClose={() => setPhotoModalOpen(false)}
          maxWidthClass="max-w-[360px]"
        />
      )}
    </section>
  );
}
