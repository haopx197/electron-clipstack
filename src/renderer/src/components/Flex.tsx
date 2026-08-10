import type { CSSProperties, HTMLAttributes } from "react";
import styled from "styled-components";

type FlexProps = HTMLAttributes<HTMLDivElement> & {
    direction?: CSSProperties["flexDirection"];
    align?: CSSProperties["alignItems"];
    justify?: CSSProperties["justifyContent"];
    wrap?: CSSProperties["flexWrap"];
    gap?: number;
    flex?: CSSProperties["flex"];
};

export const Flex = styled.div<FlexProps>`
    display: flex;
    flex-direction: ${({ direction = "row" }) => direction};
    align-items: ${({ align }) => align ?? "center"};
    justify-content: ${({ justify }) => justify ?? "flex-start"};
    flex-wrap: ${({ wrap }) => wrap ?? "nowrap"};
    gap: ${({ gap }) => (gap != null ? `${gap}px` : 0)};
    flex: ${({ flex }) => flex ?? "0 1 auto"};
`;
