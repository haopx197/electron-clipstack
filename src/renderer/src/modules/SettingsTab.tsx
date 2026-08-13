import { ChangeEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import styled from "styled-components";

import { Input } from "@renderer/components";
import { IconInformationCircle } from "@renderer/SVGs";

const MIN_MAX_CLIPS = 1;
const MAX_MAX_CLIPS = 200;

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

export function SettingsTab(): React.JSX.Element {
    const [accel, setAccel] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [maxClips, setMaxClipsState] = useState<string>("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        void window.clipstack.getHotkey().then(setAccel);
        void window.clipstack.getMaxClips().then((n) => setMaxClipsState(String(n)));
        inputRef.current?.focus();
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

    return (
        <Wrapper>
            <Input
                ref={inputRef}
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
        </Wrapper>
    );
}

const Wrapper = styled.div`
    padding: 16px;
`;

const Spacer = styled.div`
    height: 16px;
`;
