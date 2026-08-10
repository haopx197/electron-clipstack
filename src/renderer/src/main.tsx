import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { GlobalStyles } from "./globalStyles";

const container = document.getElementById("root")!;
createRoot(container).render(
    <StrictMode>
        <GlobalStyles />
        <App />
    </StrictMode>
);
