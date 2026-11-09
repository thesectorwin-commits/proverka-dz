import { redirect } from 'next/navigation';
import { Manrope, Architects_Daughter, IBM_Plex_Mono } from 'next/font/google';
import { getSession } from '@/lib/session';
import PhotoChecker from '@/components/PhotoChecker';
import DemoCheckSection from '@/components/DemoCheckSection';
import CookieBanner from '@/components/CookieBanner';
import InstallPwaButton from '@/components/InstallPwaButton';
import ThemeColorSync from '@/components/ThemeColorSync';
import { themeColorViewport } from '@/lib/themeColor';

const PAGE_THEME_COLOR = '#F4F1E9';

// 06.09.2026: theme-color в корневом app/layout.tsx задан белым (#FFFEFB) —
// это отдельная от appleWebApp.statusBarStyle настройка (та влияет только на
// standalone PWA), а theme-color красит статус-бар/адресную строку самого
// Safari в ОБЫЧНОЙ вкладке (подтверждено скриншотом владельца — белая полоса
// была видна именно там, где снизу видна адресная строка Safari, то есть это
// не PWA). Next.js объединяет viewport с более специфичного уровня (страница
// важнее layout), поэтому только на этой странице переопределяем в бежевый.
// 09.09.2026: реальный кейс на iPhone 11 (iOS 26.4.1) — тег был в разметке
// корректно, но Safari его не применяла (известная нестабильность именно
// Safari). См. lib/themeColor.ts (два тега с media вместо одного) и
// components/ThemeColorSync.tsx (доп. переустановка на клиенте) — обе
// митигации не гарантируют исправление (сторона браузера), но не мешают.
export const viewport = themeColorViewport(PAGE_THEME_COLOR);

// Google Fonts — только для этой страницы (через next/font/google, не в
// app/layout.tsx), первая внешняя шрифтовая зависимость проекта. Остальной
// сайт (личный кабинет, админка, /login) продолжает использовать системные
// font-heading/font-mono из tailwind.config.ts, без изменений.
// Sora (шрифт из исходного прототипа-артефакта) не поддерживает кириллицу
// вообще — русский текст в ней тихо откатывался бы на fallback-шрифт,
// поэтому для заголовков взят Manrope: похожий по характеру геометричный
// гротеск, с полной поддержкой кириллицы.
const display = Manrope({ subsets: ['latin', 'cyrillic'], weight: ['700', '800'] });
// Architects Daughter не поддерживает кириллицу — используется только для
// латинских цифр в кружках-номерах шагов, кириллического текста там нет.
const hand = Architects_Daughter({ subsets: ['latin'], weight: '400' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin', 'cyrillic'], weight: ['500', '600', '700'] });

const STEPS = [
  'Сфотографируйте выполненное задание',
  'Загрузите фотографию',
  'Сервис автоматически проверит задание',
  'Сервис покажет, где есть ошибки, и подскажет, как правильно выполнить задание, но не даст само решение'
];

export default async function HomePage() {
  const session = await getSession();
  if (session) {
    redirect('/dashboard');
  }

  return (
    // display.className на всю страницу (не только на отдельные заголовки) —
    // в артефакте шрифт задан один раз на body и наследуется везде; раньше
    // здесь он был проставлен только точечно (заголовки/кнопки/лейблы), а
    // обычный текст (шаги, карточка примера, футер) наследовал шрифт браузера
    // по умолчанию — на реальном экране это было видно как ещё один, третий
    // шрифт вперемешку с Manrope и IBM Plex Mono.
    <div className={display.className}>
      {/* Тот же приём, что и в DashboardShell.tsx (см. её комментарий про
          тетрадную клетку) — обычный min-h-screen на враппере красит фон
          только в пределах высоты документа, а при резиновом оттягивании
          экрана вверх на реальном iOS-устройстве (или просто выше самого
          верха при овершуте) видна область ЗА пределами этого блока — там
          проступает фон html (app/globals.css, #FFFEFB, почти белый, не
          бежевый). fixed inset-0 -z-10 не зависит от высоты документа и
          всегда закрывает ровно видимую область экрана, включая овершут. */}
      <div className="fixed inset-0 -z-10 bg-[#F4F1E9]" aria-hidden="true" />
      <ThemeColorSync color={PAGE_THEME_COLOR} />
      <main className="max-w-[720px] mx-auto px-4 sm:px-6 pt-9 pb-28 relative z-[1]">
        <header className="mb-5">
          <p className={`${plexMono.className} text-xs tracking-[0.12em] uppercase text-inkSoft text-center mb-1.5`}>
            Математика · Русский язык · Английский язык · Окружающий мир
          </p>

          {/* Крупный заголовок-хиро — НЕ <h1> (единственный <h1> сайта живёт
              в SiteHeader.tsx, там теперь короткое "Проверка домашки",
              специально освобождённое под этот полный текст здесь, чтобы
              не показывать одно и то же предложение дважды). */}
          {/* 06.09.2026: раньше "домашнего" оборачивалось в relative
              inline-block со свг-закорючкой поверх (position: absolute) —
              на реальном iOS Safari это давало ДРУГОЙ перенос строк
              (3 строки вместо 2), чем в headless Chromium, где всё
              проверялось. Заменено на обычное текстовое
              подчёркивание (decoration-wavy) — тот же волнистый штрих без
              вложенного блочного элемента, который мог сбивать расчёт
              переноса строк в другом движке рендеринга. Плюс сам текст
              заметно уменьшен/расширен (max-width) с большим запасом —
              разные браузеры по-разному меряют ширину жирного текста. */}
          <p
            className={`${display.className} font-extrabold text-[clamp(22px,6.5vw,48px)] leading-[1.2] [text-wrap:balance] text-ink text-center max-w-[23ch] mx-auto mt-1 mb-3`}
          >
            Проверка{' '}
            <span className="underline decoration-wavy decoration-[3px] decoration-[#C9962E] underline-offset-4">
              домашнего
            </span>{' '}
            задания по фото тетради
          </p>

          {/* Временно скрыто по просьбе владельца (31.08.2026) — не удалять.
          <div className="flex justify-center items-center flex-wrap gap-2 mb-3.5">
            <span className="text-[12.5px] font-extrabold text-greenCheck bg-greenSoft px-2.5 py-1 rounded-full whitespace-nowrap">
              Бесплатно
            </span>
            <span className="text-[12.5px] font-extrabold text-greenCheck bg-greenSoft px-2.5 py-1 rounded-full whitespace-nowrap">
              Без регистрации
            </span>
            <span className="text-[12.5px] font-extrabold text-greenCheck bg-greenSoft px-2.5 py-1 rounded-full whitespace-nowrap">
              Результат за несколько секунд
            </span>
          </div>
          */}
        </header>

        {/* 07.09.2026: по прямому запросу владельца — прямоугольная зона
            загрузки (с камерой, жирным заголовком и подписью) вместо
            круглой кнопки "Нажмите", но оформленная в цветах сайта
            (белый фон, зелёная пунктирная обводка, зелёный значок-бейдж)
            — см. восстановленный/переоформленный блок в
            components/PhotoChecker.tsx (view === 'idle' && !nativeUpload). */}
        <PhotoChecker
          intro={
            <div className="mb-2 text-center">
              <h2 className={`${display.className} font-extrabold text-xl text-ink mb-5`}>Как это работает</h2>
              <div className="flex flex-col gap-4 max-w-[620px] mx-auto text-left mb-6">
                {STEPS.map((step, i) => (
                  <div key={step} className="flex items-start gap-4">
                    <span
                      className={`${hand.className} shrink-0 w-9 h-9 rounded-full border-2 border-dashed border-goldChalk bg-tape/50 text-goldChalk flex items-center justify-center text-base`}
                    >
                      {i + 1}
                    </span>
                    <p className="text-[14.5px] text-inkSoft leading-relaxed mt-1.5 mb-0">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          }
          beforeUpload={<DemoCheckSection />}
          extra={
            <div className="relative max-w-[440px] mx-auto mb-5 mt-2">
              <span className="absolute -top-3.5 left-6 w-[62px] h-[26px] bg-tape rotate-[-7deg] border border-black/5 z-10" />
              <span className="absolute -top-3.5 right-6 w-[62px] h-[26px] bg-tape rotate-[6deg] border border-black/5 z-10" />
              <div className="bg-white rounded-md border border-ink/10 shadow-[0_28px_56px_-26px_rgba(38,54,79,0.25)] rotate-[-1deg] p-5 pt-6">
                <p
                  className={`${plexMono.className} text-[15px] font-bold uppercase tracking-wide text-inkSoft text-center mb-3`}
                >
                  Пример результата проверки
                </p>

                <div className="flex gap-2.5 items-start px-3 py-2.5 rounded-[10px] mb-2 bg-greenSoft">
                  <span className="shrink-0 font-extrabold text-sm w-[22px] h-[22px] rounded-full bg-white flex items-center justify-center">
                    👍
                  </span>
                  <div className="flex-1">
                    <p className="text-[13.5px] leading-snug m-0">
                      Большинство заданий выполнено верно! Есть 1 задание, которое стоит попробовать ещё раз —
                      исправь и сфотографируй страницу заново.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2.5 items-start px-3 py-2.5 rounded-[10px] mb-2 bg-redPenSoft">
                  <span className="shrink-0 font-extrabold text-sm w-[22px] h-[22px] rounded-full bg-white text-redPen flex items-center justify-center">
                    ✕
                  </span>
                  <div className="flex-1">
                    <p
                      className={`${plexMono.className} text-[11.5px] font-bold uppercase tracking-wide text-inkSoft m-0 mb-0.5`}
                    >
                      Задание 10а
                    </p>
                    <p className={`${plexMono.className} text-[13.5px] font-bold text-inkSoft m-0 mb-0.5`}>
                      37 + 42 = ?
                    </p>
                    <p className="text-[13.5px] leading-snug m-0">
                      ⚠️ Ты написал 71, но проверь сложение единиц: сколько будет 7 + 2?
                    </p>
                    <p className="text-xs leading-snug text-inkSoft mt-1.5 mb-0">
                      🔁 Попробуй решить это задание ещё раз самостоятельно, а затем сфотографируй страницу и загрузи
                      фото ещё раз.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2.5 items-start px-3 py-2.5 rounded-[10px] bg-greenSoft">
                  <span className="shrink-0 font-extrabold text-sm w-[22px] h-[22px] rounded-full bg-white text-greenCheck flex items-center justify-center">
                    ✓
                  </span>
                  <div className="flex-1">
                    <p
                      className={`${plexMono.className} text-[11.5px] font-bold uppercase tracking-wide text-inkSoft m-0 mb-0.5`}
                    >
                      Задание 10б
                    </p>
                    <p className={`${plexMono.className} text-[13.5px] font-bold text-inkSoft m-0 mb-0.5`}>
                      78 − 52 = ?
                    </p>
                    <p className="text-[13.5px] leading-snug m-0">✓ Верно: 78 − 52 = 26</p>
                  </div>
                </div>
              </div>
            </div>
          }
        />

        <footer className="text-center text-[12.5px] text-inkSoft mt-28">
          <p className="m-0">
            Проверка выполняется автоматически и может ошибаться — сверяйте спорные случаи вместе со взрослым.
          </p>
          <p className="m-0 mt-3">© TESEMNIKOV 2026</p>
        </footer>

        <CookieBanner />
      </main>

      {/* Фиксированная кнопка "Установить приложение" — только на этой
          странице (неавторизованная веб-версия — авторизованные
          редиректятся в /dashboard в начале компонента). Раньше кнопка
          была статичным блоком в хиро — вынесена сюда, чтобы не
          дублировать её в двух местах на одной странице.
          08.09.2026: сама пилюля (fixed-позиционирование, фон, рамка,
          тень) переехала ВНУТРЬ components/InstallPwaButton.tsx (см. её
          комментарий) — раньше обёртка здесь оставалась в DOM даже когда
          компонент возвращал null (уже установленный PWA), и на
          реальном устройстве было видно пустой прямоугольник с рамкой.
          БЕЗ backdrop-blur И БЕЗ transform на обёртке (сознательно, оба
          раза по факту найденного бага, см. комментарий в самом
          InstallPwaButton.tsx) — у него внутри своё модальное окно тоже
          position:fixed, а backdrop-filter/transform на родителе создают
          для fixed-потомков НОВЫЙ containing block. */}
      <InstallPwaButton variant="outline" />
    </div>
  );
}
