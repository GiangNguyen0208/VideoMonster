import { NavLink } from "react-router-dom";
import { LanguageSelect } from "@/app/LanguageSelect";
import { Clapperboard, Moon, Plus, Sun, UserCircle } from "@/components/icons";
import { ButtonLink, ComingSoon } from "@/components/ui";
import { BRAND } from "@/content/brand";
import { useT } from "@/i18n";
import { useTheme } from "@/lib/theme";
import { cn } from "@/utils/cn";
import { NotifyToggle } from "./NotifyToggle";
import { ConnectionPill, SpendPill } from "./StatusPills";

const NAV = [
  { to: "/", key: "home", end: true },
  { to: "/new", key: "newVideo" },
  { to: "/library", key: "library" },
  { to: "/setup", key: "setup" },
  { to: "/settings", key: "settings" },
] as const;

const iconButton =
  "grid size-9 place-items-center rounded-control text-text-2 transition hover:bg-surface-2 hover:text-text";

/** The one app header (Stitch "Top Navigation Bar"). */
export function Header() {
  const [theme, toggleTheme] = useTheme();
  const t = useT();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 lg:flex-nowrap xl:gap-x-5">
        <NavLink to="/" className="flex shrink-0 items-center gap-2.5 font-semibold tracking-tight">
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-control bg-accent text-on-accent"
          >
            <Clapperboard className="size-4.5" />
          </span>
          <span>
            {BRAND.first}
            <span className="text-accent">{BRAND.accent}</span>
          </span>
        </NavLink>
        <nav
          aria-label={t.app.mainNav}
          className="order-last -mx-1 flex w-full gap-1 lg:order-none lg:mx-0 lg:w-auto lg:shrink-0"
        >
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={"end" in item ? item.end : undefined}
              className={({ isActive }) =>
                cn(
                  "relative shrink-0 px-2 py-2 text-sm font-medium whitespace-nowrap transition xl:px-3",
                  "after:absolute after:inset-x-2 after:-bottom-[11px] after:h-0.5 after:rounded-full xl:after:inset-x-3",
                  isActive
                    ? "text-accent after:bg-accent"
                    : "text-text-2 after:bg-transparent hover:text-text",
                )
              }
            >
              {t.app.nav[item.key]}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <ConnectionPill />
          <SpendPill />
          <LanguageSelect compact />
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={t.app.switchTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? t.app.themeDark : t.app.themeLight}
            className={iconButton}
          >
            {theme === "dark" ? <Moon className="size-4.5" /> : <Sun className="size-4.5" />}
          </button>
          <NotifyToggle className={iconButton} />
          <ComingSoon badge={false}>
            <span className={iconButton} title={t.common.comingSoon}>
              <UserCircle className="size-5" aria-hidden />
              <span className="sr-only">
                {t.app.account} — {t.common.comingSoon}
              </span>
            </span>
          </ComingSoon>
          <ButtonLink
            to="/new"
            variant="primary"
            size="sm"
            leftIcon={<Plus className="size-4" />}
            aria-label={t.app.newVideoCtaLabel}
            className="ml-1 hidden sm:inline-flex"
          >
            {t.app.newVideoCta}
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
