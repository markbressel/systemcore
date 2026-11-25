import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { App } from "./app/App";
import { Overlay } from "./features/overlay/Overlay";
// Bundled fonts: never rely on what is installed on the user's machine.
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import "./styles/main.scss";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {getCurrentWindow().label === "overlay" ? <Overlay /> : <App />}
  </StrictMode>,
);
