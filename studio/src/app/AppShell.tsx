import { NavLink, Outlet } from "react-router-dom";
import { LanguageSelect } from "@/app/LanguageSelect";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useTheme } from "@/lib/theme";

const NAV = [
  { to: "/", key: "home", end: true },
  { to: "/new", key: "newVideo" },
  { to: "/library", key: "library" },
  { to: "/setup", key: "setup" },
  { to: "/settings", key: "settings" },
] as const;

export function AppShell() {
  const [theme, toggleTheme] = useTheme();
  const t = useT();

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"
      >
        {t.app.skipToContent}
      </a>
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-6" />
            OpenMontage <span className="text-accent">Studio</span>
          </NavLink>
          <nav
            aria-label={t.app.mainNav}
            className="order-last -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:mx-0 md:w-auto md:flex-1"
          >
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : undefined}
                className={({ isActive }) =>
                  cn(
                    "shrink-0 rounded-control px-3 py-1.5 text-sm font-medium whitespace-nowrap transition",
                    isActive
                      ? "bg-surface-3 text-text"
                      : "text-text-2 hover:bg-surface-2 hover:text-text",
                  )
                }
              >
                {t.app.nav[item.key]}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 md:ml-0">
            <a href="/" className="text-sm whitespace-nowrap text-text-2 hover:text-text">
              {t.app.classicBoard}
            </a>
            <LanguageSelect compact />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={t.app.switchTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-control border border-border px-2.5 py-1 text-sm text-text-2 hover:text-text"
            >
              {theme === "dark" ? t.app.themeDark : t.app.themeLight}
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
