import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";

import { Button, Typography } from "../components";

// Warning banner when Accessibility permission is missing. Non-blocking:
// clipboard history still works, only auto-Cmd+V is disabled.
export function AccessibilityBanner() {
    const [trusted, setTrusted] = useState<boolean | null>(null);

    useEffect(() => {
        let cancelled = false;
        void window.clipstack.getAccessibilityStatus().then((ok) => {
            if (cancelled) return;
            setTrusted(ok);
        });

        // macOS caches `AXIsProcessTrusted()` per-process — grant OR revoke
        // is invisible until the process restarts. So on any AX notification
        // we relaunch to force a fresh read; the new process either sees
        // trusted (banner hides) or untrusted (banner shows). Cost: on the
        // very first launch after install, the helper's AX prime adds it to
        // TCC and triggers one spurious notification → one spurious relaunch.
        // Subsequent launches don't re-add (already in TCC) so this happens
        // exactly once per install. Accepted trade-off for zero latency on
        // real user toggles.
        const offAX = window.clipstack.onAccessibilityChanged(() => {
            void window.clipstack.relaunch();
        });
        return () => {
            cancelled = true;
            offAX();
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
