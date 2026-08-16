import { useEffect, useState } from "react";
import styled from "styled-components";
import type { UpdateInstallProgress, UpdateStatus } from "../../../shared/types";
import { Button, Typography } from "../components";

// Informational strip shown when the boot-time updater found a newer release.
// Non-blocking: dismissing is not required. Nothing renders until hasUpdate flips true.
export function UpdateBanner() {
    const [status, setStatus] = useState<UpdateStatus>({ hasUpdate: false, notes: null });
    const [install, setInstall] = useState<UpdateInstallProgress>({
        phase: "idle",
        percent: 0,
        error: null
    });

    useEffect(() => {
        void window.clipstack.getUpdateStatus().then(setStatus);
        return window.clipstack.onUpdateInstallProgress(setInstall);
    }, []);

    if (!status.hasUpdate) return null;

    const { phase, percent, error } = install;
    const busy = phase === "downloading" || phase === "installing";
    const title =
        phase === "downloading"
            ? `Downloading update… ${Math.round(percent * 100)}%`
            : phase === "installing"
              ? "Installing update…"
              : phase === "error"
                ? "Update failed"
                : "Update available";
    const subtitle =
        phase === "installing"
            ? "ClipStack will restart in a few seconds…"
            : phase === "error" && error
              ? error
              : status.notes || "A newer version of ClipStack is ready.";

    return (
        <Wrap role="status">
            <ProgressFill $percent={phase === "downloading" ? percent : 0} />
            <Content>
                <TextCol>
                    <Typography size={12} weight="medium" color="var(--color-text-strong)">
                        {title}
                    </Typography>
                    <Subtitle>
                        <Typography size={12} color="var(--color-text-strong)">
                            {subtitle}
                        </Typography>
                    </Subtitle>
                </TextCol>
                {!busy && (
                    <Button onClick={() => window.clipstack.installUpdate()}>
                        {phase === "error" ? "Retry" : "Install"}
                    </Button>
                )}
            </Content>
        </Wrap>
    );
}

const Wrap = styled.div`
    position: relative;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--color-primary) 15%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--color-primary) 30%, transparent);
    flex-shrink: 0;
    overflow: hidden;
`;

const ProgressFill = styled.div<{ $percent: number }>`
    position: absolute;
    inset: 0;
    width: ${(p) => Math.max(0, Math.min(1, p.$percent)) * 100}%;
    background: color-mix(in srgb, var(--color-primary) 25%, transparent);
    transition: width 120ms linear;
    pointer-events: none;
`;

const Content = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
`;

const TextCol = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const Subtitle = styled.div`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;
