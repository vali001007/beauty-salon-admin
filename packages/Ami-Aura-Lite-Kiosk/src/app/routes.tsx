import { createBrowserRouter } from "react-router";
import AppContent from "./AppContent";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AppContent,
  },
  {
    path: "*",
    Component: AppContent,
  },
]);
