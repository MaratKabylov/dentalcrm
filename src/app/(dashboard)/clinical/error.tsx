"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ClinicalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="mx-auto max-w-xl p-8 text-center">
      <h1 className="text-xl font-semibold">Не удалось загрузить клинические данные</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Повторите попытку. Если ошибка сохраняется, проверьте подключение к базе данных.</p>
      <Button className="mt-5" onClick={reset}>Повторить</Button>
    </Card>
  );
}
