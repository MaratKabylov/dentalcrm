"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

export function InvitationLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex gap-2">
      <input readOnly value={value} aria-label="Ссылка приглашения" className="h-10 min-w-0 flex-1 rounded-xl border bg-white px-3 text-xs text-[var(--muted)]" />
      <Button type="button" variant="secondary" onClick={copy} className="shrink-0">
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Скопировано" : "Копировать"}
      </Button>
    </div>
  );
}

