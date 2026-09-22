"use client";

import { Button } from "@/components/ui/button";

export default function CalendarError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto grid min-h-80 max-w-3xl place-items-center rounded-2xl border bg-white p-8 text-center">
      <div><h1 className="text-xl font-semibold">Не удалось загрузить календарь</h1><p className="mt-2 text-sm text-[var(--muted)]">Повторите попытку или проверьте, применены ли новые миграции.</p><Button className="mt-5" onClick={reset}>Попробовать снова</Button></div>
    </div>
  );
}
