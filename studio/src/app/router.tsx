import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { AppShell } from "./AppShell";
import {
  HomePage,
  LibraryPage,
  NewVideoPage,
  NotFoundPage,
  ProjectPage,
  SettingsPage,
  SetupPage,
} from "./pages";

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
