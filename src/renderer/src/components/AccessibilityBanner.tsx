import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { Button } from "./Button";
import { Typography } from "./Typography";

// Warning banner when Accessibility permission is missing. Non-blocking:
// clipboard history still works, only auto-Cmd+V is disabled.
export function AccessibilityBanner() {
    const [trusted, setTrusted] = useState<boolean | null>(null);

    useEffect(() => {
        let cancelled = false;
        let prev: boolean | null = null;
        const check = async (): Promise<void> => {
            const ok = await window.clipstack.getAccessibilityStatus();
            if (cancelled) return;
            // Transition false → true: user just granted permission. Auto-relaunch so Swift
            // helper re-inits with AX permission from the start (mouse monitor + AX focus
            // query need fresh state; they don't pick it up mid-run).
            if (prev === false && ok) {
                void window.clipstack.relaunch();
                return;
            }
            prev = ok;
            setTrusted(ok);
        };
        void check();
        // Poll 300ms for near-instant feedback when user toggles in System Settings.
        // isTrustedAccessibilityClient is a cheap sync system call.
        const id = window.setInterval(check, 300);
        // Re-check when window/tab regains focus (user just returned from Settings).
        const onFocus = (): void => void check();
        const onVis = (): void => {
            if (document.visibilityState === "visible") void check();
        };
        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onVis);
        return () => {
            cancelled = true;
            window.clearInterval(id);
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onVis);
        };
    }, []);

    const handleOpen = useCallback(() => {
        void window.clipstack.openAccessibilitySettings();
    }, []);

    if (trusted !== false) return null;

    return (
        <Wrap role="alert">
            <MessageBox>
                <Typography size={12} color="var(--color-text-strong)">
                    Auto-paste disabled — grant <strong>Accessibility</strong> to enable ⌘V paste.
                </Typography>
            </MessageBox>
            <Button danger onClick={handleOpen}>
                Open Settings
            </Button>
        </Wrap>
    );
}

const Wrap = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--color-error) 12%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent);
    flex-shrink: 0;
`;

const MessageBox = styled.div`
    flex: 1;
    min-width: 0;
`;
