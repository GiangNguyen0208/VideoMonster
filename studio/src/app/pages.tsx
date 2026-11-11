import { lazy } from "react";

// Pages load on demand (Phase D.5.4); the shell renders at once and shows a
// spinner in the page area while a page chunk loads (Suspense in AppShell).
export const HomePage = lazy(() => import("@/routes/home").then((m) => ({ default: m.HomePage })));
export const NewVideoPage = lazy(() =>
  import("@/routes/new").then((m) => ({ default: m.NewVideoPage })),
);
export const LibraryPage = lazy(() =>
  import("@/routes/library").then((m) => ({ default: m.LibraryPage })),
);
export const ProjectPage = lazy(() =>
  import("@/routes/project").then((m) => ({ default: m.ProjectPage })),
);
export const SetupPage = lazy(() =>
  import("@/routes/setup").then((m) => ({ default: m.SetupPage })),
);
export const SettingsPage = lazy(() =>
  import("@/routes/settings").then((m) => ({ default: m.SettingsPage })),
);
export const NotFoundPage = lazy(() =>
  import("@/routes/not-found").then((m) => ({ default: m.NotFoundPage })),
);
