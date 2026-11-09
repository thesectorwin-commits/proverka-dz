// Тетрадная клетка — только для лендинга и входа (эта группа роутов не меняет
// URL, /  и /login остаются как были). Личный кабинет (app/(site)/dashboard/)
// сознательно вне этой группы — там бежевый фон, см. components/DashboardShell.tsx
// и комментарий в app/globals.css про то, почему клетка раньше протекала на
// бежевые вкладки при скролле на реальных устройствах.
export default function NotebookLayout({ children }: { children: React.ReactNode }) {
  return <div className="grid-paper-bg min-h-screen">{children}</div>;
}
