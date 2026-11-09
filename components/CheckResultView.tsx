export type CheckTask = {
  number: string;
  condition: string;
  status: 'correct' | 'incorrect' | 'unclear';
  explanation: string;
  correct_solution: string;
};

const STATUS_ICON: Record<string, string> = {
  correct: '✓',
  incorrect: '✕',
  unclear: '?'
};

// Отрисовка результата одной проверки (сводка + список заданий) — общая
// для экрана "результат только что проверенного фото" (PhotoChecker) и
// для раскрытой карточки в истории проверок (HistoryTab).
export default function CheckResultView({
  grade,
  generalComment,
  tasks,
  afterSummary
}: {
  grade: number | null;
  generalComment: string;
  tasks: CheckTask[];
  /** Контент между сводкой и списком заданий (например, зона "Проверить ещё одно фото"). */
  afterSummary?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 bg-pencilOrange/10 rounded-xl px-4 py-3.5 mb-4">
        <span className="text-xl shrink-0">📝</span>
        <p className="flex-1 text-[15px] leading-relaxed m-0">{generalComment}</p>
        {grade === 4 || grade === 5 ? (
          <span className="shrink-0 w-[34px] h-[34px] rounded-full border-2 border-redPen text-redPen flex items-center justify-center font-heading font-bold bg-white/85 rotate-[8deg]">
            {grade}
          </span>
        ) : null}
      </div>

      {afterSummary}

      <div>
        {tasks.map((task, idx) => (
          <div
            key={task.number + idx}
            className="flex gap-3 border-t border-[#E7ECF2] py-3.5 first:border-t-0 first:pt-0"
          >
            <span
              className={
                'shrink-0 w-[26px] h-[26px] rounded-full flex items-center justify-center text-sm font-extrabold mt-0.5 ' +
                (task.status === 'correct'
                  ? 'bg-greenSoft text-greenCheck'
                  : task.status === 'incorrect'
                  ? 'bg-redPenSoft text-redPen'
                  : 'bg-[#F1EEE4] text-pencilOrange')
              }
              aria-hidden="true"
            >
              {STATUS_ICON[task.status]}
            </span>
            <div className="flex-1">
              <p className="font-mono text-[13px] uppercase tracking-wide text-inkSoft mb-1">
                Задание {task.number}
              </p>
              {task.condition && <p className="text-sm text-inkSoft italic mb-1.5">{task.condition}</p>}
              {task.status === 'incorrect' && task.explanation && (
                <p className="text-[14.5px] leading-relaxed mb-1.5">⚠️ {task.explanation}</p>
              )}
              {task.status === 'unclear' && (
                <p className="text-[14.5px] leading-relaxed mb-1.5">
                  ❓ {task.explanation || 'Не получилось точно разобрать эту запись на фото.'}
                </p>
              )}
              {task.status === 'correct' && task.correct_solution && (
                <p className="text-sm leading-relaxed bg-greenCheck/[0.07] border-l-[3px] border-greenCheck px-2.5 py-2 rounded-r">
                  ✓ Верно: {task.correct_solution}
                </p>
              )}
              {(task.status === 'incorrect' || task.status === 'unclear') && (
                <p className="text-sm leading-relaxed bg-redPen/[0.06] border-l-[3px] border-redPen px-2.5 py-2 rounded-r">
                  {task.status === 'unclear'
                    ? '✏️ Перепиши ответ аккуратнее, сфотографируй эту страницу и загрузи фото ещё раз.'
                    : '🔁 Попробуй решить это задание ещё раз самостоятельно, а затем сфотографируй страницу и загрузи фото ещё раз.'}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
