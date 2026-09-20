import type { Metadata } from "next";
import "./globals.css";
import { AuthShell } from "./auth-shell";

export const metadata: Metadata = {
  title: "Dental — управление клиникой",
  description: "Рабочая система стоматологической клиники: расписание, пациенты, лечение и финансы"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body><AuthShell apiUrl={process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1"}>{children}</AuthShell></body>
    </html>
  );
}
