import { createGlobalStyle } from "styled-components";

export const GlobalStyles = createGlobalStyle`
    :root {
        --color-success: #77cc1a;
        --color-error: #dd4558;
        --color-info: #ef8611;
        --color-text: #141B34;
        --color-border: #DADADB;
        --color-handle: #c1c1c1;
        --color-primary: #0493e5;

        --color-bg: #ffffff;
        --color-text-strong: #2b2d31;

        --font: "Google Sans", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
    }

    * {
        box-sizing: border-box;
    }

    html,
    body,
    #root {
        margin: 0;
        padding: 0;
        height: 100%;
        overflow: hidden;
    }

    body {
        font-family: var(--font);
        font-size: 14px;
        color: var(--color-text);
        background: var(--color-bg);
        user-select: none;
        cursor: default;
    }

    button {
        font-family: inherit;
        font-size: inherit;
        color: inherit;
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
    }

    button:focus {
        outline: none;
    }
`;
