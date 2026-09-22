import { BrandMark } from "@/components/shared/brand-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[#0b3d35] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 size-[34rem] rounded-full border border-white/10" />
        <div className="absolute -bottom-40 left-16 size-[29rem] rounded-full bg-[#137d6c]/35 blur-3xl" />
        <BrandMark />
        <div className="relative max-w-xl">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
            Единое пространство клиники
          </p>
          <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-0.045em]">
            Всё важное для клиники — в одном спокойном интерфейсе.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-emerald-50/70">
            Расписание, пациенты, лечение и финансы с безопасным разделением данных между организациями.
          </p>
        </div>
        <p className="relative text-xs text-emerald-100/50">Dental OS · Kazakhstan</p>
      </section>
      <section className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 lg:hidden">
            <BrandMark />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
