import { BookOpenText } from "lucide-react";

import { DirectoryManager } from "@/modules/directories/directory-manager";
import { getDirectoryManagementData } from "@/modules/directories/repository";

export default async function DirectoriesSettingsPage() {
  const data = await getDirectoryManagementData();
  return <div className="mx-auto max-w-6xl space-y-6"><div className="flex items-start gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]"><BookOpenText className="size-6" /></div><div><p className="text-sm font-semibold text-[var(--brand)]">Настройки</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">Справочники</h1><p className="mt-2 text-sm text-[var(--muted)]">Общие и филиальные значения, используемые в работе клиники.</p></div></div><DirectoryManager data={data} /></div>;
}
