import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { HomePage } from "@/routes/home";
import { LibraryPage } from "@/routes/library";
import { NewVideoPage } from "@/routes/new";
import { NotFoundPage } from "@/routes/not-found";
import { ProjectPage } from "@/routes/project";
import { SettingsPage } from "@/routes/settings";
import { SetupPage } from "@/routes/setup";
import { AppShell } from "./AppShell";

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "new", element: <NewVideoPage /> },
      { path: "library", element: <LibraryPage /> },
      { path: "p/:projectId", element: <ProjectPage /> },
      { path: "setup", element: <SetupPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

// Served under /studio by Backlot; Vite's base sets BASE_URL to "/studio/".
export function createRouter() {
  return createBrowserRouter(routes, { basename: import.meta.env.BASE_URL.replace(/\/$/, "") });
}
