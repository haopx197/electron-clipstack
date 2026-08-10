import type { MouseEvent } from "react";
import styled, { css } from "styled-components";
import type { ClipboardItem, ClipboardItemType } from "../../../shared/types";
import { IconDelete, IconFolderFileStorage, IconImageCrop, IconPin, IconPinOff, IconTextCreation } from "../SVGs";
import { Button } from "../components";

interface Props {
    item: ClipboardItem;
    onPaste: (id: string) => void;
    onPin: (id: string) => void;
    onDelete: (id: string) => void;
}

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

function TypeIcon({ type }: { type: ClipboardItemType }): React.JSX.Element {
    switch (type) {
        case "image":
            return <IconImageCrop />;
        case "file":
            return <IconFolderFileStorage />;
        case "text":
        case "html":
        case "rtf":
        case "bookmark":
        default:
            return <IconTextCreation />;
    }
}

function ItemBody({ item }: { item: ClipboardItem }): React.JSX.Element {
    switch (item.type) {
        case "text":
            return <ItemText>{item.content}</ItemText>;

        case "image":
            return <ItemImage src={imageUrl(item.content)} alt="clipboard image" />;

        case "html":
            return (
                <>
                    <Badges>
                        <BadgeHtml>HTML</BadgeHtml>
                    </Badges>
                    <ItemText>{item.preview || item.content.replace(/<[^>]+>/g, " ").slice(0, 300)}</ItemText>
                </>
            );

        case "rtf":
            return (
                <>
                    <Badges>
                        <BadgeRtf>RTF</BadgeRtf>
                    </Badges>
                    <ItemText>{item.preview || "(rich text)"}</ItemText>
                </>
            );

        case "bookmark":
            return (
                <Bookmark>
                    <BookmarkTitle>{item.bookmarkTitle || item.preview || hostname(item.content)}</BookmarkTitle>
                    <BookmarkUrl>{item.content}</BookmarkUrl>
                </Bookmark>
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

export function ClipboardItemRow({ item, onPaste, onPin, onDelete }: Props): React.JSX.Element {
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
                    {item.pinned ? <IconPinOff /> : <IconPin />}
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
                    <IconDelete />
                </Button>
            </Actions>
        </Item>
    );
}

const ItemText = styled.div`
    color: var(--color-text-strong);
    line-height: 1.35;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 12.5px;
`;

const ItemImage = styled.img`
    max-width: 100%;
    max-height: 120px;
    border: 1px solid var(--color-border);
    display: block;
    object-fit: contain;
`;

const Badges = styled.div`
    display: flex;
    gap: 4px;
    margin-bottom: 4px;
`;

const badgeBase = css`
    display: inline-block;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.4px;
    padding: 1px 5px;
    border-radius: 3px;
    line-height: 1.4;
    text-transform: uppercase;
`;

const BadgeHtml = styled.span`
    ${badgeBase};
    background: rgba(239, 134, 17, 0.14);
    color: var(--color-info);
`;

const BadgeRtf = styled.span`
    ${badgeBase};
    background: rgba(119, 204, 26, 0.16);
    color: #5aa314;
`;

const Bookmark = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
`;

const BookmarkTitle = styled.div`
    color: var(--color-text-strong);
    font-weight: 600;
    font-size: 12.5px;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const BookmarkUrl = styled.div`
    color: var(--color-primary);
    font-size: 11.5px;
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
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const FilePath = styled.div`
    color: var(--color-text);
    font-size: 11px;
    opacity: 0.75;
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
    align-self: center;
`;

const Item = styled.div<{ $pinned: boolean }>`
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 12px;
    margin: 2px 6px;
    cursor: pointer;

    ${(p) =>
        p.$pinned &&
        css`
            background: rgba(4, 147, 229, 0.05);
        `}
`;
