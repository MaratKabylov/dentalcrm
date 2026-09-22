"use client";

import { useRef } from "react";
import { ChevronDown } from "lucide-react";

import { switchOrganization } from "@/modules/organizations/actions";
import type { OrganizationMembership } from "@/modules/organizations/types";

export function OrganizationSwitcher({
  activeOrganizationId,
  memberships,
}: {
  activeOrganizationId: string;
  memberships: OrganizationMembership[];
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={switchOrganization}>
      <label className="relative block">
        <span className="sr-only">Организация</span>
        <select
          name="organizationId"
          defaultValue={activeOrganizationId}
          onChange={() => formRef.current?.requestSubmit()}
          className="h-9 appearance-none rounded-xl border bg-white py-0 pl-3 pr-8 text-sm font-medium"
        >
          {memberships.map(({ organization }) => (
            <option key={organization.id} value={organization.id}>
              {organization.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-[var(--muted)]" />
      </label>
    </form>
  );
}
