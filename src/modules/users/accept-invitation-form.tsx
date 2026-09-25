"use client";

import { useActionState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { acceptInvitation } from "@/modules/users/actions";

const initialState = { status: "idle" as const };

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitation, initialState);
  return (
    <form action={action} className="mt-6">
      <input type="hidden" name="token" value={token} />
      {state.message && <div role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-[var(--danger)]">{state.message}</div>}
      <Button className="h-11 w-full" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <><span>Присоединиться к клинике</span><ArrowRight className="size-4" /></>}</Button>
    </form>
  );
}

