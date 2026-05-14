import React from "react";
import { ToastProvider } from "./components/Toast";
import WnbaDashboard from "./pages/WnbaDashboard";

export default function App() {
  return (
    <ToastProvider>
      <WnbaDashboard />
    </ToastProvider>
  );
}
