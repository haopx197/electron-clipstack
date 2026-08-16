import { useEffect, useState } from "react";
import styled from "styled-components";
import type { UpdateInstallProgress, UpdateStatus } from "../../../shared/types";
import { Button } from "./Button";
import { Typography } from "./Typography";

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

    const busy = install.phase === "downloading" || install.phase === "installing";

    return (
        <Wrap role="status">
            <ProgressFill $percent={install.phase === "downloading" ? install.percent : 0} />
            <Content>
                <TextCol>
                    <Typography size={12} weight="medium" color="var(--color-text-strong)">
                        {install.phase === "downloading" && `Downloading update… ${Math.round(install.percent * 100)}%`}
                        {install.phase === "installing" && "Installing update…"}
                        {install.phase === "error" && "Update failed"}
                        {(install.phase === "idle" || install.phase === "error") && "Update available"}
                    </Typography>
                    <Subtitle>
                        <Typography size={11} color="var(--color-text-strong)">
                            {install.phase === "installing"
                                ? "ClipStack will restart shortly."
                                : install.phase === "error" && install.error
                                  ? install.error
                                  : status.notes || "A newer version of ClipStack is ready."}
                        </Typography>
                    </Subtitle>
                </TextCol>
                {!busy && (
                    <Button onClick={() => window.clipstack.installUpdate()}>
                        {install.phase === "error" ? "Retry" : "Install"}
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
    opacity: 0.75;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;
