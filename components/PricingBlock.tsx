'use client';

import { useState } from 'react';

const TIERS = [
  { value: '299', className: 'bg-greenCheck/10 border-greenCheck/20' },
  { value: '599', className: 'bg-pencilOrange/10 border-pencilOrange/25' },
  { value: '899', className: 'bg-accent/10 border-accent/25' }
];

export default function PricingBlock() {
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  async function vote(tier: string | null, choice: 'ok' | 'no') {
    if (sending || submitted) return;
    setSending(true);
    try {
      await fetch('/api/pricing-vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, choice })
      });
    } finally {
      setSending(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="bg-white/70 border border-ink/10 rounded-2xl shadow-lg shadow-ink/10 p-5 mb-5">
      <p className="font-heading font-bold text-lg text-ink text-center mb-2">
        🧪 Сервис работает в тестовом режиме
      </p>
      <p className="text-[14.5px] text-inkSoft leading-relaxed text-center mb-4">
        Сейчас в сервисе можно бесплатно сделать только 5 проверок. Нам важно понять, сколько родители
        готовы платить за такой сервис в будущем. Выберите, пожалуйста, честно — какая цена подписки в
        месяц была бы для вас приемлемой:
      </p>

      {submitted ? (
        <p className="text-center text-[14px] font-bold text-greenCheck">Спасибо, ваш ответ учтён!</p>
      ) : (
        <>
          <div className="flex gap-3 flex-wrap justify-center">
            {TIERS.map((tier) => (
              <div
                key={tier.value}
                className={`flex-1 min-w-[140px] border-[1.5px] rounded-xl px-4 py-4 text-center ${tier.className}`}
              >
                <p className="font-heading font-bold text-2xl text-ink mb-3">
                  {tier.value} ₽<span className="text-[13px] font-normal text-inkSoft">/мес</span>
                </p>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => vote(tier.value, 'ok')}
                  className="w-full bg-greenCheck text-white font-extrabold text-[13.5px] rounded-[10px] px-2.5 py-2.5 disabled:opacity-60"
                >
                  Цена подходит
                </button>
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-3.5">
            <button
              type="button"
              disabled={sending}
              onClick={() => vote(null, 'no')}
              className="bg-redPen text-white font-bold text-sm rounded-[10px] px-5 py-2.5 disabled:opacity-60"
            >
              Не готов платить
            </button>
          </div>
        </>
      )}
    </div>
  );
}
