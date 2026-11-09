'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CheckTab from '@/components/CheckTab';
import HintTab from '@/components/HintTab';
import HistoryTab from '@/components/HistoryTab';
import NotificationsTab from '@/components/NotificationsTab';
import ProfileTab from '@/components/ProfileTab';
import DeleteAccountButton from '@/components/DeleteAccountButton';
import InstallPwaButton from '@/components/InstallPwaButton';
import IosPushPrompt from '@/components/IosPushPrompt';
import ThemeColorSync from '@/components/ThemeColorSync';
import { usePushSubscription } from '@/lib/usePushSubscription';
import { getMoscowDateStr } from '@/lib/moscowDate';

type CheckSummary = {
  id: string;
  subject: string;
  grade: number | null;
  general_comment: string;
  created_at: string;
  incorrect_count: number;
  unclear_count: number;
  has_photo: boolean;
};

type TabKey = 'check' | 'hint' | 'history' | 'notifications' | 'profile';

// Векторные значки таббара — в стиле нативного PWA-эскиза, вместо эмодзи.
const CheckIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path
      d="M4 8h2.6l1-2h8.8l1 2H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="13.5" r="3.2" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const HintIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path
      d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const HistoryIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect x="3.5" y="5" width="17" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const BellIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path
      d="M18 8a6 6 0 1 0-12 0c0 5-2 6-2 7h16c0-1-2-2-2-7Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M9.5 18a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const ProfileIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="8" r="3.6" stroke="currentColor" strokeWidth="2" />
    <path d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const TABS: { key: TabKey; icon: React.ReactNode; lines: string[] }[] = [
  { key: 'check', icon: CheckIcon, lines: ['Проверить'] },
  { key: 'hint', icon: HintIcon, lines: ['Подсказать'] },
  { key: 'history', icon: HistoryIcon, lines: ['История'] },
  { key: 'notifications', icon: BellIcon, lines: ['Уведомления'] },
  { key: 'profile', icon: ProfileIcon, lines: ['Профиль'] }
];

const VALID_TABS = TABS.map((t) => t.key);

// См. комментарий у <main> ниже — вкладки, на которых футер прижимается
// к низу экрана флексом вместо обычного block-flow.
const PIN_FOOTER_TABS = new Set<TabKey>(['check', 'hint', 'profile']);

export default function DashboardShell({ initialTodayChecks }: { initialTodayChecks: CheckSummary[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  // Активная вкладка живёт в URL (?tab=...), а не в локальном state — так
  // клик по логотипу в шапке (ссылка на /dashboard без query) надёжно
  // возвращает на "Проверить задание" даже если пользователь уже открыл
  // дашборд на другой вкладке, без перезагрузки страницы.
  const activeTab: TabKey = (VALID_TABS as string[]).includes(tabParam || '') ? (tabParam as TabKey) : 'check';
  // Ссылка из push-уведомления о готовой проверке: /dashboard?tab=history&checkId=...
  const checkId = searchParams.get('checkId');

  // Только проверки за сегодня — история дальше построена вокруг
  // календаря (см. HistoryTab.tsx), остальные дни он подгружает сам.
  const [todayChecks, setTodayChecks] = useState<CheckSummary[]>(initialTodayChecks);
  const push = usePushSubscription(true);

  // Подстраховка на случай, если todayChecks успел устареть (например,
  // проверка сделана на другом устройстве той же сессии, или
  // handleCheckSaved почему-то не сработал) — перечитываем сегодняшний
  // день с сервера при каждом заходе на вкладку "История проверок", а не
  // только полагаемся на локальный state.
  useEffect(() => {
    if (activeTab !== 'history') return;
    fetch(`/api/checks/list?date=${getMoscowDateStr()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.checks) setTodayChecks(data.checks);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  function selectTab(tab: TabKey) {
    router.replace(tab === 'check' ? '/dashboard' : `/dashboard?tab=${tab}`, { scroll: false });
  }

  function handleCheckSaved(check: {
    id: string;
    subject: string;
    grade: number | null;
    generalComment: string;
    createdAt: string;
    tasks: { status: string }[];
  }) {
    setTodayChecks((prev) => [
      {
        id: check.id,
        subject: check.subject,
        grade: check.grade,
        general_comment: check.generalComment,
        created_at: check.createdAt,
        incorrect_count: check.tasks.filter((t) => t.status === 'incorrect').length,
        unclear_count: check.tasks.filter((t) => t.status === 'unclear').length,
        // Оптимистично true — фото только что загружено вместе с проверкой.
        // Если заливка в Storage по какой-то причине не удалась, превью
        // просто не отрисуется (img поймает ошибку загрузки), ничего не
        // сломается — не стоит ради этого делать доп. запрос за has_photo.
        has_photo: true
      },
      ...prev
    ]);
  }

  return (
    <>
      {/* Бежевый фон личного кабинета — отдельный fixed-слой на весь вьюпорт,
          а НЕ background на <main>. Раньше красили <main> и подгоняли его
          высоту под экран через min-h-[calc(100dvh-3.5rem)] — на реальных
          устройствах это всё равно оставляло щели с клеткой: во время
          инерционного/резинового скролла (свайп за пределы контента) видна
          область ЗА пределами <main>, а 100dvh на iOS Safari плавает при
          скрытии/появлении адресной строки, так что точный расчёт высоты в
          px периодически не совпадал с реальной.
          Была и вторая, более тонкая причина, из-за которой fixed-слой с
          отрицательным z-index сам по себе не помогал: клетка была задана
          на <body> (глобально, app/globals.css) — а body, как обычный
          непозиционированный элемент, красит СВОЙ фон в общем потоке вместе
          с <main>/шапкой/таббаром, ПОСЛЕ элементов с отрицательным z-index
          (они красятся раньше, а не позже, вопреки интуиции) — поэтому
          клетка на body всё равно перекрывала fixed-слой с -z-10. Починили
          у первопричины: клетка теперь отдельный класс `.grid-paper-bg`,
          который стоит только на лендинге/входе
          (app/(site)/(notebook)/layout.tsx), а body по умолчанию простой.
          Теперь fixed inset-0 -z-10 здесь работает как и задумывалось: не
          зависит от высоты документа вообще (в отличие от min-h-calc),
          всегда закрывает ровно видимую область экрана. */}
      <div className="fixed inset-0 -z-10 bg-[#F4F1E9]" aria-hidden="true" />
      <ThemeColorSync color="#F4F1E9" />
      {/* max-w-[1100px] mx-auto px-4 sm:px-6 — точь-в-точь как контейнер шапки
          (components/SiteHeader.tsx), чтобы боковое меню начиналось строго под
          логотипом, а не прижималось к краю экрана отдельно от него. */}
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 md:flex md:items-start">
        {/* Десктоп: боковое меню вместо нижнего Tab Bar */}
        <nav className="hidden md:flex md:flex-col md:w-56 md:shrink-0 md:sticky md:top-14 md:self-start md:pt-8 md:pb-6 md:pr-6 md:gap-1 md:border-r md:border-ink/10">
          {TABS.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => selectTab(tab.key)}
                className={
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-left transition-colors ' +
                  (active ? 'bg-greenSoft text-greenCheck' : 'text-inkSoft hover:bg-ink/5')
                }
              >
                <span className="text-lg leading-none shrink-0" aria-hidden="true">
                  {tab.icon}
                </span>
                <span>{tab.lines.join(' ')}</span>
              </button>
            );
          })}
        </nav>

        {/* На вкладках "Проверить"/"Подсказать"/"Профиль" — flex-колонка
            высотой в весь видимый экран (минус шапка), чтобы футер
            (плюс "Установить приложение" и, на "Профиль", "Удалить
            аккаунт") прижимался к низу БЕЗ скролла на любом реальном
            экране, а не через подобранный на глаз фиксированный отступ.
            08.09.2026: расширено с одной "Профиль" на "Проверить" и
            "Подсказать" по прямому запросу владельца — там футер с
            дисклеймером тоже оказывался ниже экрана из-за большого
            mt-28 после кнопки "Установить приложение" плюс собственного
            min-h-[58vh] у PhotoChecker/HintTab. "История"/"Уведомления"
            не тронуты — эти вкладки могут быть длиннее экрана и должны
            скроллиться как обычно. */}
        <main
          className={
            'flex-1 min-w-0 max-w-[720px] pt-8 pb-28 md:pb-10 md:pl-6' +
            (PIN_FOOTER_TABS.has(activeTab)
              ? ' flex flex-col min-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))]'
              : '')
          }
        >
          <div className={activeTab === 'check' ? '' : 'hidden'}>
            <CheckTab onCheckSaved={handleCheckSaved} />
          </div>

          <div className={activeTab === 'hint' ? '' : 'hidden'}>
            <HintTab />
          </div>

          <div className={activeTab === 'history' ? '' : 'hidden'}>
            <HistoryTab todayChecks={todayChecks} initialExpandedId={checkId} />
          </div>

          <div className={activeTab === 'notifications' ? '' : 'hidden'}>
            <NotificationsTab
              pushStatus={push.status}
              pushLoading={push.loading}
              subscribe={push.subscribe}
              unsubscribe={push.unsubscribe}
            />
          </div>

          <div className={activeTab === 'profile' ? '' : 'hidden'}>
            <ProfileTab />
          </div>

          {/* Отступ сверху уменьшен (был pt-10 mt-6 = 64px) — на вкладке
              "Проверить" (и остальных, кроме "Профиль") между последним
              блоком контента и этой кнопкой набегало слишком много пустого
              места, из-за чего кнопка оказывалась ниже видимой области
              экрана и требовала прокрутки, чтобы её увидеть целиком. */}
          <div className={'pt-2 flex justify-center' + (PIN_FOOTER_TABS.has(activeTab) ? ' mt-auto' : ' mt-2')}>
            <InstallPwaButton />
          </div>

          {/* "Удалить аккаунт" перенесена сюда, вниз, поближе к футеру —
              раньше стояла сразу под "Выйти" во вкладке "Профиль"
              (components/ProfileTab.tsx), деструктивное действие было
              слишком близко к обычному. Показывается только на вкладке
              "Профиль" (activeTab==='profile'), а не во всех — иначе
              кнопка удаления аккаунта попала бы в общий футер, видимый
              на каждой вкладке. mt-auto выше (на кнопке "Установить
              приложение") уже прижимает всю эту группу к низу экрана —
              здесь достаточно небольшого фиксированного отступа между
              двумя кнопками, а не подобранного вручную большого. */}
          {activeTab === 'profile' && (
            <div className="max-w-[420px] mx-auto mt-6 bg-white/85 border border-ink/[0.06] rounded-2xl shadow-sm overflow-hidden">
              <DeleteAccountButton />
            </div>
          )}

          {/* Тот же дисклеймер, что в футере главной страницы
              (app/(site)/page.tsx) — здесь его не было вообще. Отступ
              сверху меньше на вкладках из PIN_FOOTER_TABS (mt-8 вместо
              mt-28) — mt-auto на кнопке "Установить приложение" выше уже
              прижимает всю группу к низу экрана, большой mt-28 поверх
              этого только увеличивал бы общую высоту и требовал
              прокрутки. На "История"/"Уведомления" (block-flow,
              скроллятся как обычно) отступ прежний. */}
          <footer
            className={
              'text-center text-[12.5px] text-inkSoft ' + (PIN_FOOTER_TABS.has(activeTab) ? 'mt-8' : 'mt-28')
            }
          >
            <p className="m-0">
              Проверка выполняется автоматически и может ошибаться — сверяйте спорные случаи вместе со взрослым.
            </p>
            <p className="m-0 mt-3">© TESEMNIKOV 2026</p>
          </footer>
        </main>

        {/* Мобайл/PWA: нижний Tab Bar */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-[500] bg-[#F4F1E9]/95 backdrop-blur border-t border-ink/10 flex"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {TABS.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => selectTab(tab.key)}
                className={
                  'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-center transition-colors ' +
                  (active ? 'text-greenCheck' : 'text-inkSoft')
                }
              >
                <span className="text-lg leading-none" aria-hidden="true">
                  {tab.icon}
                </span>
                <span className="text-[11px] font-bold leading-tight">
                  {tab.lines.map((line, i) => (
                    <span key={i} className="block">
                      {line}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </nav>

        <IosPushPrompt status={push.status} loading={push.loading} subscribe={push.subscribe} />
      </div>
    </>
  );
}
