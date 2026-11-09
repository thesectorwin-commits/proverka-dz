'use client';

export default function ProfileTab() {
  return (
    <section>
      <div className="flex flex-col items-center gap-1 py-2 mb-6">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-greenCheck to-[#257d50] text-white font-heading font-extrabold text-2xl flex items-center justify-center shadow-[0_8px_18px_-8px_rgba(46,158,99,0.55)] mb-2.5">
          Я
        </div>
        <p className="text-[15px] font-bold text-ink m-0">Аккаунт подключён</p>
        <p className="text-[12.5px] text-inkSoft m-0">через Яндекс ID</p>
      </div>

      <div className="bg-white/85 border border-ink/[0.06] rounded-2xl shadow-sm overflow-hidden mb-4">
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
            <span className="w-[30px] h-[30px] rounded-lg bg-inkSoft flex items-center justify-center shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
                  stroke="#fff"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M16 17l5-5-5-5M21 12H9"
                  stroke="#fff"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="text-[15px] font-medium text-ink">Выйти</span>
          </button>
        </form>
      </div>
    </section>
  );
}
