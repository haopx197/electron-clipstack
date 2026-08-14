import type { MouseEvent } from "react";
import styled, { css } from "styled-components";
import type { ClipboardItem, ClipboardItemType } from "../../../shared/types";
import { IconDelete, IconFolderFileStorage, IconImageCrop, IconPin, IconPinOff, IconTextCreation } from "../SVGs";
import { Button } from "../components";

type Props = {
    item: ClipboardItem;
    onPaste: (id: string) => void;
    onPin: (id: string) => void;
    onDelete: (id: string) => void;
};

function imageUrl(path: string): string {
    return `clip-image://local${encodeURI(path)}`;
}

function stop(e: MouseEvent): void {
    e.stopPropagation();
}

function hostname(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

function TypeIcon({ type }: { type: ClipboardItemType }) {
    switch (type) {
        case "image":
            return <IconImageCrop />;
        case "file":
            return <IconFolderFileStorage />;
        case "text":
        case "bookmark":
        default:
            return <IconTextCreation />;
    }
}

function ItemBody({ item }: { item: ClipboardItem }) {
    switch (item.type) {
        case "text":
            return <ItemText>{item.content}</ItemText>;

        case "image":
            return <ItemImage src={imageUrl(item.content)} alt="clipboard image" />;

        case "bookmark":
            return (
                <div>
                    <BookmarkTitle>{item.bookmarkTitle || item.preview || hostname(item.content)}</BookmarkTitle>
                    <BookmarkUrl>{item.content}</BookmarkUrl>
                </div>
            );

        case "file":
            return (
                <FileBox>
                    <FileName>{item.fileName || item.content}</FileName>
                    <FilePath>{item.content}</FilePath>
                </FileBox>
            );
    }
}

export function ClipboardItemRow({ item, onPaste, onPin, onDelete }: Props) {
    const handleClick = (): void => onPaste(item.id);

    return (
        <Item $pinned={item.pinned} onClick={handleClick} role="button" tabIndex={0}>
            <TypeIconBox aria-hidden="true">
                <TypeIcon type={item.type} />
            </TypeIconBox>
            <Body>
                <ItemBody item={item} />
            </Body>
            <Actions>
                <Button
                    variant="icon"
                    title={item.pinned ? "Unpin" : "Pin"}
                    onClick={(e) => {
                        stop(e);
                        onPin(item.id);
                    }}
                    aria-label={item.pinned ? "Unpin item" : "Pin item"}
                >
                    {item.pinned ? <IconPinOff color="var(--color-primary)" /> : <IconPin />}
                </Button>
                <Button
                    variant="icon"
                    title="Delete"
                    onClick={(e) => {
                        stop(e);
                        onDelete(item.id);
                    }}
                    aria-label="Delete item"
                >
                    <IconDelete color="var(--color-error)" />
                </Button>
            </Actions>
        </Item>
    );
}

const ItemText = styled.div`
    color: var(--color-text-strong);
    line-height: 1.5;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 12px;
`;

const ItemImage = styled.img`
    max-width: 100%;
    max-height: 120px;
    border: 1px solid var(--color-border);
    display: block;
    object-fit: contain;
`;

const BookmarkTitle = styled.div`
    color: var(--color-text-strong);
    font-weight: 500;
    font-size: 12px;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const BookmarkUrl = styled.div`
    color: var(--color-primary);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const FileBox = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
`;

const FileName = styled.div`
    color: var(--color-text-strong);
    font-weight: 600;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const FilePath = styled.div`
    color: var(--color-text);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const TypeIconBox = styled.div`
    flex-shrink: 0;
    color: var(--color-text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 1px;
`;

const Body = styled.div`
    flex: 1;
    min-width: 0;
    overflow: hidden;
`;

const Actions = styled.div`
    display: inline-flex;
    flex-shrink: 0;
    gap: 4px;
`;

const Item = styled.div<{ $pinned: boolean }>`
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    cursor: pointer;

    ${(p) =>
        p.$pinned &&
        css`
            background-color: #ebeef1;
        `}
`;
