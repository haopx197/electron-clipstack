import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";

// Banner cảnh báo khi chưa có Accessibility permission. Poll 2s một lần —
// khi user cấp trong System Settings, banner tự biến mất ngay lần poll kế.
// Không blocking: user vẫn dùng copy history được, chỉ mất auto-Cmd+V.
export function AccessibilityBanner(): React.JSX.Element | null {
    const [trusted, setTrusted] = useState<boolean | null>(null);

    useEffect(() => {
        let cancelled = false;
        let prev: boolean | null = null;
        const check = async (): Promise<void> => {
            const ok = await window.clipstack.getAccessibilityStatus();
            if (cancelled) return;
            // Transition false → true: user vừa cấp quyền. Auto-relaunch để
            // Swift helper re-init với AX permission ngay từ đầu (mouse monitor
            // + AX focus query cần state fresh, không tự pick up mid-run).
            if (prev === false && ok) {
                void window.clipstack.relaunch();
                return;
            }
            prev = ok;
            setTrusted(ok);
        };
        void check();
        const id = window.setInterval(check, 2000);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, []);

    const handleOpen = useCallback(() => {
        void window.clipstack.openAccessibilitySettings();
    }, []);

    if (trusted !== false) return null;

    return (
        <Wrap role="alert">
            <Message>
                Auto-paste disabled — grant <strong>Accessibility</strong> to enable ⌘V paste.
            </Message>
            <OpenBtn onClick={handleOpen}>Open Settings</OpenBtn>
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
    font-size: 12px;
    color: var(--color-text-strong);
    flex-shrink: 0;
`;

const Message = styled.span`
    flex: 1;
    min-width: 0;
    line-height: 1.4;
`;

const OpenBtn = styled.button`
    padding: 4px 10px;
    border-radius: 6px;
    background: var(--color-error);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;

    &:hover {
        opacity: 0.9;
    }
`;
