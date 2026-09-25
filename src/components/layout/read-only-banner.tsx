import { LockKeyhole } from "lucide-react";

import type { OrganizationSummary } from "@/modules/organizations/types";

export function ReadOnlyBanner({ organization }: { organization: OrganizationSummary }) {
  if (!organization.isReadOnly) return null;

  const expired = organization.accessState === "expired";
  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${organization.accessUntil}T12:00:00Z`));

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-amber-950 lg:px-8">
      <div className="mx-auto flex max-w-7xl items-start gap-3 text-sm">
        <LockKeyhole className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">Организация работает в режиме только для чтения</p>
          <p className="mt-0.5 text-xs leading-5 text-amber-800">
            {expired
              ? `Срок доступа закончился ${date}. Просмотр и экспорт доступны, изменения отключены.`
              : `${organization.suspensionReason ?? "Доступ приостановлен администратором сервиса."} Просмотр и экспорт доступны, изменения отключены.`}
          </p>
        </div>
      </div>
    </div>
  );
}
