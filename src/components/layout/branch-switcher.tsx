"use client";

import { useRef } from "react";
import { ChevronDown, MapPin } from "lucide-react";

import { switchBranch } from "@/modules/organizations/actions";
import type { BranchAccessSummary } from "@/modules/organizations/types";

export function BranchSwitcher({
  activeBranchId,
  branches,
}: {
  activeBranchId: string;
  branches: BranchAccessSummary[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const activeBranches = branches.filter((branch) => branch.isActive);

  return (
    <form ref={formRef} action={switchBranch}>
      <label className="relative block">
        <span className="sr-only">Текущий филиал</span>
        <MapPin className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-[var(--brand)]" />
        <select
          name="branchId"
          defaultValue={activeBranchId}
          onChange={() => formRef.current?.requestSubmit()}
          className="h-9 max-w-56 appearance-none rounded-xl border bg-white py-0 pl-8 pr-8 text-sm font-medium"
        >
          {activeBranches.map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-[var(--muted)]" />
      </label>
    </form>
  );
}
