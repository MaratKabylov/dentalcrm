"use client";

import { Button } from "@/components/ui/button";

export default function CrmError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="mx-auto grid min-h-96 max-w-3xl place-items-center text-center"><div><h1 className="text-2xl font-semibold">Не удалось загрузить CRM</h1><p className="mt-2 text-sm text-[var(--muted)]">Проверьте подключение и попробуйте снова.</p><Button onClick={reset} className="mt-5">Повторить</Button></div></div>;
}
