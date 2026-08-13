import { useEffect, useState } from "react";
import styled from "styled-components";

import { IconSelect, IconPaintBoard, IconSettings } from "@renderer/SVGs";
import { ClipboardTab } from "./ClipboardTab";
import { IconsTab } from "./IconsTab";
import { SettingsTab } from "./SettingsTab";

type TabKey = "clipboard" | "icons" | "settings";

export function TabView(): React.JSX.Element {
    const [tab, setTab] = useState<TabKey>("clipboard");

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent): void => {
            if (e.key !== "Escape") return;
            if (tab === "settings") {
                setTab("clipboard");
            } else {
                window.clipstack.hideWindow();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [tab]);

    return (
        <>
            <TabBar role="tablist">
                <TabGroup>
                    <TabButton role="tab" aria-selected={tab === "clipboard"} onClick={() => setTab("clipboard")}>
                        <IconSelect color={tab === "clipboard" ? "#0493e5" : "#141B34"} />
                        {tab === "clipboard" && <TabActive />}
                    </TabButton>
                    <TabButton role="tab" aria-selected={tab === "icons"} onClick={() => setTab("icons")}>
                        <IconPaintBoard color={tab === "icons" ? "#0493e5" : "#141B34"} />
                        {tab === "icons" && <TabActive />}
                    </TabButton>
                </TabGroup>
                <TabButton role="tab" aria-selected={tab === "settings"} onClick={() => setTab("settings")}>
                    <IconSettings color={tab === "settings" ? "#0493e5" : "#141B34"} />
                </TabButton>
            </TabBar>
            {tab === "clipboard" && <ClipboardTab />}
            {tab === "icons" && <IconsTab />}
            {tab === "settings" && <SettingsTab />}
        </>
    );
}

const TabBar = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 2px solid var(--color-border);
`;

const TabGroup = styled.div`
    display: flex;
    align-items: center;
`;

const TabButton = styled.button`
    width: 60px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
`;

const TabActive = styled.div`
    position: absolute;
    left: 0;
    right: 0;
    bottom: -2px;
    height: 2px;
    background-color: var(--color-primary);
`;
