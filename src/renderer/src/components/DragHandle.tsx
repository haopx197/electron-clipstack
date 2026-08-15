import styled from "styled-components";

export function DragHandle() {
    return (
        <Bar aria-hidden="true">
            <Grip />
        </Bar>
    );
}

const Bar = styled.div`
    -webkit-app-region: drag;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    cursor: grab;

    &:active {
        cursor: grabbing;
    }
`;

const Grip = styled.div`
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--color-border);
`;
