import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";

import type { ClipboardItem } from "../types";
import { Button, Empty, Typography } from "../components";
import { ClipboardItemRow } from ".";

export function ClipboardTab() {
    const [items, setItems] = useState<ClipboardItem[]>([]);
    const [maxClips, setMaxClips] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        void window.clipstack.getItems().then((data) => {
            if (!cancelled) setItems(data);
        });
        void window.clipstack.getMaxClips().then((n) => {
            if (!cancelled) setMaxClips(n);
        });
        const off = window.clipstack.onItemsUpdated((next) => setItems(next));
        return () => {
            cancelled = true;
            off();
        };
    }, []);

    const handlePaste = useCallback(async (id: string) => {
        await window.clipstack.pasteItem(id);
    }, []);

    const handlePin = useCallback(async (id: string) => {
        const next = await window.clipstack.pinItem(id);
        setItems(next);
    }, []);

    const handleDelete = useCallback(async (id: string) => {
        const next = await window.clipstack.deleteItem(id);
        setItems(next);
    }, []);

    const handleOpen = useCallback(async (id: string) => {
        await window.clipstack.openItem(id);
    }, []);

    const handleClearAll = useCallback(async () => {
        const next = await window.clipstack.clearAll();
        setItems(next);
    }, []);

    const unpinnedCount = items.filter((i) => !i.pinned).length;
    const canClear = unpinnedCount > 0;

    return (
        <>
            <Header>
                <CountGroup>
                    <Typography>
                        {items.length}
                        {maxClips !== null ? ` / ${maxClips}` : ""} {items.length === 1 ? "clip" : "clips"}
                    </Typography>
                    {maxClips !== null ? (
                        <Typography size={12}>Older unpinned clips are auto-removed past {maxClips}.</Typography>
                    ) : null}
                </CountGroup>
                {canClear && (
                    <Button variant="secondary" danger onClick={handleClearAll}>
                        Clear All
                    </Button>
                )}
            </Header>
            <List>
                {items.length === 0 ? (
                    <Empty>Copy something to see it here.</Empty>
                ) : (
                    items.map((item) => (
                        <ClipboardItemRow
                            key={item.id}
                            item={item}
                            onPaste={handlePaste}
                            onPin={handlePin}
                            onDelete={handleDelete}
                            onOpen={handleOpen}
                        />
                    ))
                )}
            </List>
        </>
    );
}

const Header = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--color-border);
    font-size: 12px;
    flex-shrink: 0;
`;

const CountGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
`;

const List = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
`;
