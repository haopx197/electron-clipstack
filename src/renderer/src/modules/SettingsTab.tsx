import { ChangeEvent, KeyboardEvent, useEffect, useState } from "react";
import styled from "styled-components";

import { Button, Callout, CalloutCode, Flex, Input, SettingToggle, Typography } from "@renderer/components";
import { IconInformationCircle } from "@renderer/SVGs";
import { MIN_MAX_CLIPS, MAX_MAX_CLIPS, UpdateInstallProgress, UpdateStatus } from "../../../shared/types";

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

function keyToAccelPart(key: string): string | null {
    if (key.length === 1) return key.toUpperCase();
    const map: Record<string, string> = {
        ArrowUp: "Up",
        ArrowDown: "Down",
        ArrowLeft: "Left",
        ArrowRight: "Right",
        " ": "Space",
        Enter: "Return",
        Tab: "Tab",
        Backspace: "Backspace",
        Delete: "Delete",
        Escape: "Escape",
        Home: "Home",
        End: "End",
        PageUp: "PageUp",
        PageDown: "PageDown"
    };
    if (/^F\d{1,2}$/.test(key)) return key;
    return map[key] ?? null;
}

const IS_ASCII = /^[\x20-\x7E]+$/;

function codeToAscii(code: string): string | null {
    const letter = code.match(/^Key([A-Z])$/);
    if (letter) return letter[1];
    const digit = code.match(/^Digit(\d)$/);
    if (digit) return digit[1];
    return null;
}

function buildAccelerator(e: KeyboardEvent<HTMLInputElement>): string | null {
    if (MODIFIER_KEYS.has(e.key)) return null;
    let keyPart = keyToAccelPart(e.key);
    if (!keyPart || !IS_ASCII.test(keyPart)) {
        keyPart = codeToAscii(e.code);
    }
    if (!keyPart) return null;
    const parts: string[] = [];
    if (e.metaKey) parts.push("Command");
    if (e.ctrlKey) parts.push("Control");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (parts.length === 0) return null;
    parts.push(keyPart);
    return parts.join("+");
}

function humanize(accel: string): string {
    return accel
        .split("+")
        .map((p) => ({ Command: "⌘", Control: "⌃", Alt: "⌥", Shift: "⇧" })[p] ?? p)
        .join(" ");
}

function clampMaxClips(n: number): number {
    if (!Number.isFinite(n)) return MIN_MAX_CLIPS;
    const rounded = Math.floor(n);
    if (rounded < MIN_MAX_CLIPS) return MIN_MAX_CLIPS;
    if (rounded > MAX_MAX_CLIPS) return MAX_MAX_CLIPS;
    return rounded;
}

export function SettingsTab() {
    const [accel, setAccel] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [maxClips, setMaxClipsState] = useState<string>("");
    const [captureToClipboard, setCaptureToClipboardState] = useState<boolean>(true);
    const [update, setUpdate] = useState<UpdateStatus>({ hasUpdate: false, notes: null });
    const [install, setInstall] = useState<UpdateInstallProgress>({
        phase: "idle",
        percent: 0,
        error: null
    });

    useEffect(() => {
        void window.clipstack.getHotkey().then(setAccel);
        void window.clipstack.getMaxClips().then((n) => setMaxClipsState(String(n)));
        void window.clipstack.getCaptureToClipboard().then(setCaptureToClipboardState);
        void window.clipstack.getUpdateStatus().then(setUpdate);
        return window.clipstack.onUpdateInstallProgress(setInstall);
    }, []);

    const onKeyDown = async (e: KeyboardEvent<HTMLInputElement>): Promise<void> => {
        e.preventDefault();
        e.stopPropagation();
        const next = buildAccelerator(e);
        if (!next || next === accel) return;
        const result = await window.clipstack.setHotkey(next);
        if (result.ok) {
            setAccel(next);
            setError(null);
        } else {
            setError("Failed to register hotkey.");
        }
    };

    const onMaxClipsChange = (e: ChangeEvent<HTMLInputElement>): void => {
        setMaxClipsState(e.target.value);
    };

    const commitMaxClips = async (): Promise<void> => {
        const parsed = parseInt(maxClips, 10);
        const next = clampMaxClips(Number.isNaN(parsed) ? MIN_MAX_CLIPS : parsed);
        const res = await window.clipstack.setMaxClips(next);
        setMaxClipsState(String(res.maxClips));
    };

    const onMaxClipsKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === "Enter") {
            e.currentTarget.blur();
        }
    };

    const changeCaptureToClipboard = async (next: boolean): Promise<void> => {
        setCaptureToClipboardState(next);
        const applied = await window.clipstack.setCaptureToClipboard(next);
        setCaptureToClipboardState(applied);
    };

    return (
        <Wrapper>
            <Input
                label="Shortcut - Press keys to change."
                labelIcon={<IconInformationCircle />}
                error={error}
                value={accel ? humanize(accel) : ""}
                placeholder="⌘ ⇧ V"
                readOnly
                onKeyDown={onKeyDown}
            />
            <Spacer />
            <Input
                label={`Max clips (${MIN_MAX_CLIPS}–${MAX_MAX_CLIPS})`}
                labelIcon={<IconInformationCircle />}
                type="number"
                min={MIN_MAX_CLIPS}
                max={MAX_MAX_CLIPS}
                value={maxClips}
                onChange={onMaxClipsChange}
                onBlur={commitMaxClips}
                onKeyDown={onMaxClipsKeyDown}
            />
            <Spacer />
            <Flex gap={8} style={{ marginBottom: 8 }}>
                <IconInformationCircle />
                <Typography size={12} weight="medium" transform="uppercase">
                    Capture screenshots to clipboard
                </Typography>
            </Flex>
            <SettingToggle
                on={captureToClipboard}
                onChange={changeCaptureToClipboard}
                title={captureToClipboard ? "On" : "Off"}
                hint={
                    captureToClipboard
                        ? "⌘⇧3/4/5 goes to ClipStack. macOS thumbnail + Desktop save are paused while ClipStack runs, and restored automatically on Quit."
                        : "⌘⇧3/4/5 uses native macOS behavior (thumbnail + save to Desktop). ClipStack does not capture screenshots."
                }
            />
            <Spacer />
            <Callout>
                If macOS screenshots stop showing the preview thumbnail even after quitting ClipStack (e.g. because it
                was force-killed), turn this toggle OFF here, or run once in Terminal:
                <CalloutCode>defaults delete com.apple.screencapture target && killall SystemUIServer</CalloutCode>
            </Callout>
            {update.hasUpdate && (
                <>
                    <Spacer />
                    <Flex gap={8} style={{ marginBottom: 8 }}>
                        <IconInformationCircle />
                        <Typography size={12} weight="medium" transform="uppercase">
                            Update available
                        </Typography>
                    </Flex>
                    <UpdateBox>
                        {update.notes && (
                            <Notes>
                                <Typography size={12}>{update.notes}</Typography>
                            </Notes>
                        )}
                        {install.phase === "downloading" && (
                            <ProgressWrap>
                                <ProgressBar $percent={install.percent} />
                                <Typography size={11} style={{ marginTop: 4, opacity: 0.7 }}>
                                    Downloading… {Math.round(install.percent * 100)}%
                                </Typography>
                            </ProgressWrap>
                        )}
                        {install.phase === "installing" && (
                            <Typography size={11} style={{ marginTop: 8, opacity: 0.7 }}>
                                Installing… ClipStack will restart shortly.
                            </Typography>
                        )}
                        {install.phase === "error" && install.error && (
                            <Typography size={11} style={{ marginTop: 8, opacity: 0.7 }}>
                                Install failed: {install.error}
                            </Typography>
                        )}
                        {install.phase !== "downloading" && install.phase !== "installing" && (
                            <Flex gap={8} style={{ marginTop: 10 }}>
                                <Button onClick={() => window.clipstack.installUpdate()}>Install update</Button>
                            </Flex>
                        )}
                    </UpdateBox>
                </>
            )}
        </Wrapper>
    );
}

const Wrapper = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px;
`;

const Spacer = styled.div`
    height: 16px;
`;

const UpdateBox = styled.div`
    padding: 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
`;

const Notes = styled.div`
    margin-top: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--color-white);
    white-space: pre-wrap;
`;

const ProgressWrap = styled.div`
    margin-top: 10px;
`;

const ProgressBar = styled.div<{ $percent: number }>`
    height: 6px;
    border-radius: 6px;
    background: var(--color-white);
    position: relative;
    overflow: hidden;

    &::after {
        content: "";
        position: absolute;
        inset: 0;
        width: ${(p) => Math.max(0, Math.min(1, p.$percent)) * 100}%;
        background: var(--color-primary);
        transition: width 120ms linear;
    }
`;
