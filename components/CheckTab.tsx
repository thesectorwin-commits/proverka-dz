'use client';

import PhotoChecker from '@/components/PhotoChecker';
import { CheckTask } from '@/components/CheckResultView';

export default function CheckTab({
  onCheckSaved
}: {
  onCheckSaved: (check: {
    id: string;
    subject: string;
    grade: number | null;
    generalComment: string;
    createdAt: string;
    tasks: CheckTask[];
  }) => void;
}) {
  return (
    <PhotoChecker
      header={
        <p className="font-mono text-xs tracking-[0.12em] uppercase text-accent text-center -mt-3 mb-6">
          Математика · Русский язык · Английский язык · Окружающий мир
        </p>
      }
      resultsTitle="Результат проверки"
      nativeUpload
      onCheckSaved={onCheckSaved}
    />
  );
}
