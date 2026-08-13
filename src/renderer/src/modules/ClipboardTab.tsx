import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";

import type { ClipboardItem } from "../types";
import { Button } from "../components";
import { ClipboardItemRow } from ".";

export function ClipboardTab(): React.JSX.Element {
    const [items, setItems] = useState<ClipboardItem[]>([]);

    useEffect(() => {
        let cancelled = false;
        void window.clipstack.getItems().then((data) => {
            if (!cancelled) setItems(data);
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

    const handleClearAll = useCallback(async () => {
        const next = await window.clipstack.clearAll();
        setItems(next);
    }, []);

    const unpinnedCount = items.filter((i) => !i.pinned).length;
    const canClear = unpinnedCount > 0;

    return (
        <>
            <Header>
                <Count>
                    {items.length} {items.length === 1 ? "clip" : "clips"}
                </Count>
                <Button variant="secondary" danger onClick={handleClearAll} disabled={!canClear}>
                    Clear All
                </Button>
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

const Count = styled.span`
    color: var(--color-text);
`;

const List = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
`;

const Empty = styled.div`
    padding: 32px 16px;
    text-align: center;
    color: var(--color-text);
    opacity: 0.7;
    font-size: 12px;
`;
