import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { Spinner } from "@/components/ui";
import { useT } from "@/i18n";

export function AppShell() {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"
      >
        {t.app.skipToContent}
      </a>
      <Header />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <Suspense fallback={<Spinner label={t.common.loading} />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
