import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { MobileApp } from "./mobile-app";
import "./mobile.css";

const root = document.getElementById("root");
if (!root) throw new Error("Mobile root element is missing.");

createRoot(root).render(
  <StrictMode>
    <MobileApp />
  </StrictMode>,
);
