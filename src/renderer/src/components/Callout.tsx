import type { ReactNode } from "react";
import styled from "styled-components";

import { Typography } from "./Typography";

type CalloutProps = {
    children: ReactNode;
};

export function Callout({ children }: CalloutProps) {
    return (
        <Box>
            <Typography size={12}>{children}</Typography>
        </Box>
    );
}

export function CalloutCode({ children }: { children: ReactNode }) {
    return <CodeBox>{children}</CodeBox>;
}

const Box = styled.div`
    padding: 12px 16px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--color-primary) 20%, transparent);
`;

const CodeBox = styled.div`
    margin-top: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    background: var(--color-white);
    font-family: var(--font-mono);
    font-size: 12px;
    word-break: break-word;
    user-select: text;
    letter-spacing: -0.4px;
`;
