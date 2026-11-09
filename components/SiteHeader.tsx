import Link from 'next/link';
import { Manrope } from 'next/font/google';
import { getSession } from '@/lib/session';

// Тот же шрифт, что и в крупном заголовке-хиро на главной
// (app/(site)/page.tsx) — до 06.09.2026 шапка использовала системный
// font-heading (Trebuchet MS), а заголовок ниже неё — Manrope, из-за чего
// два текста об одном и том же ("Проверка домашки" / "Проверка домашнего
// задания...") на одном экране визуально были в разных шрифтах. next/font
// дедуплицирует загрузку одного и того же шрифта/начертания между файлами,
// поэтому повторный вызов здесь не тянет шрифт дважды.
const manrope = Manrope({ subsets: ['latin', 'cyrillic'], weight: ['700', '800'] });

// Единая шапка сайта (лендинг + личный кабинет, десктоп/мобайл/PWA).
// Клик по логотипу — на главную для гостей, в раздел "Проверить задание"
// личного кабинета для авторизованных (переход на /dashboard без query
// сбрасывает активную вкладку на дефолтную — см. DashboardShell).
// position: fixed (не sticky) — на реальном iOS-устройстве sticky-шапка
// "отклеивалась" и утягивалась вниз вместе с резиновым оттягиванием экрана
// (потянуть за фон вверх-вниз от самого верха страницы) — sticky привязан
// к своему прокручиваемому контейнеру, который во время эластичного
// оттягивания сам визуально растягивается, а fixed жёстко привязан к
// вьюпорту и от этого не зависит. Раз шапка убрана из потока — под ней
// стоит явный спейсер высотой h-14 + safe-area-inset-top
// (app/(site)/layout.tsx), чтобы контент не заезжал под неё, как раньше
// это делал сам sticky.
//
// pt-[env(safe-area-inset-top)] на самом <header> — с 06.09.2026, когда
// statusBarStyle сменили на 'black-translucent' (app/layout.tsx): теперь
// статус-бар в установленном PWA прозрачный и шапка физически рисуется под
// ним (нужно, чтобы был виден бежевый фон сквозь него), но без этого
// отступа лого/кнопка оказались бы прямо под чёлкой/иконками статус-бара.
export default async function SiteHeader() {
  const session = await getSession();
  const href = session ? '/dashboard' : '/';

  return (
    <header className="fixed top-0 left-0 right-0 z-[1100] bg-[#F4F1E9]/95 backdrop-blur border-b border-ink/10 pt-[env(safe-area-inset-top)]">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href={href} className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          {/* Декоративный значок (не настоящая PWA-иконка) — по прямому
              запросу владельца, точная копия одобренного артефакта: тонкая
              зелёная обводка вместо залитого квадрата. Настоящая PWA-иконка
              (/icons/icon-192.png) остаётся как есть везде, где она нужна
              по смыслу — на экране телефона, в favicon, в манифесте — этот
              значок только для шапки сайта. */}
          <span
            aria-hidden="true"
            className="shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-lg border-2 border-greenCheck bg-greenSoft text-greenCheck font-extrabold text-xs sm:text-sm flex items-center justify-center -rotate-[4deg]"
          >
            ✓
          </span>
          {/* Короткое название бренда — с редизайна главной (05.09.2026)
              полный описательный текст ("Проверка домашнего задания по
              фото тетради") живёт как крупный заголовок-хиро прямо на
              главной странице (app/(site)/page.tsx, не <h1> — во избежание
              дублирования этого <h1>), а в общей шапке остаётся короткое
              название, единое для всех экранов. */}
          <h1 className={`${manrope.className} font-extrabold text-sm sm:text-lg text-ink truncate m-0`}>
            Проверка домашки
          </h1>
        </Link>

        {/* Кнопка входа — точная копия одобренного артефакта (рядом с
            логотипом, в общей шапке), показывается только неавторизованным
            (для сессии её смысла нет — пользователь уже внутри). Шапка
            общая для всех страниц группы (site), поэтому кнопка появляется
            и на /login — там убрана дублирующая кнопка в теле страницы
            (login/page.tsx), чтобы не было двух одинаковых кнопок подряд. */}
        {!session && (
          <a
            href="/api/auth/yandex"
            className={`${manrope.className} shrink-0 inline-flex items-center gap-2 bg-goldButton hover:brightness-95 text-ink font-extrabold text-[11.5px] sm:text-[15px] px-2.5 sm:px-6 py-1.5 sm:py-3 rounded-lg sm:rounded-[10px] shadow-[0_8px_18px_-8px_rgba(232,196,104,0.5)] transition whitespace-nowrap`}
          >
            Войти через Яндекс ID
          </a>
        )}
      </div>
    </header>
  );
}
