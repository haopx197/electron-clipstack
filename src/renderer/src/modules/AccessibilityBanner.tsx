import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";

import { Button, Typography } from "../components";

// Warning banner when Accessibility permission is missing. Non-blocking:
// clipboard history still works, only auto-Cmd+V is disabled.
export function AccessibilityBanner() {
    const [trusted, setTrusted] = useState<boolean | null>(null);

    useEffect(() => {
        let cancelled = false;
        let untrusted = false;
        void window.clipstack.getAccessibilityStatus().then((ok) => {
            if (cancelled) return;
            untrusted = !ok;
            setTrusted(ok);
        });

        // macOS caches `AXIsProcessTrustedWithOptions` per-process: after the
        // user grants Accessibility, calling it again in the running process
        // still returns `false`. Re-checking here is useless. When the
        // `com.apple.accessibility.api` distributed notification fires and we
        // were untrusted, just restart — the new process reads the fresh
        // state. Guarded so grants to other apps don't cycle us while we're
        // already trusted.
        const offAX = window.clipstack.onAccessibilityChanged(() => {
            if (untrusted) void window.clipstack.relaunch();
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
