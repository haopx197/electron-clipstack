import type { CSSProperties, ReactNode } from "react";
import styled from "styled-components";

type Weight = "regular" | "medium" | "semiBold" | "bold";

const WEIGHT: Record<Weight, number> = {
    regular: 400,
    medium: 500,
    semiBold: 600,
    bold: 700
};

export function Typography({
    weight = "regular",
    size = 14,
    color,
    align,
    transform,
    spacing = 0.2,
    lineHeight,
    style = {},
    children = null
}: {
    weight?: Weight;
    size?: number | string;
    color?: CSSProperties["color"];
    align?: CSSProperties["textAlign"];
    transform?: CSSProperties["textTransform"];
    spacing?: number | string;
    lineHeight?: number | string;
    style?: CSSProperties;
    children?: ReactNode;
}) {
    return (
        <Text
            $weight={weight}
            $size={size}
            $color={color}
            $align={align}
            $transform={transform}
            $spacing={spacing}
            $lineHeight={lineHeight}
            style={style}
        >
            {children}
        </Text>
    );
}

const Text = styled.div<{
    $weight: Weight;
    $size: number | string;
    $color?: CSSProperties["color"];
    $align?: CSSProperties["textAlign"];
    $transform?: CSSProperties["textTransform"];
    $spacing: number | string;
    $lineHeight?: number | string;
}>`
    font-family: var(--font);
    font-weight: ${(p) => WEIGHT[p.$weight]};
    font-size: ${(p) => p.$size}px;
    letter-spacing: ${(p) => p.$spacing}px;
    line-height: ${(p) => p.$lineHeight ?? 1.4};
    ${(p) => p.$color !== undefined && `color: ${p.$color};`}
    ${(p) => p.$align !== undefined && `text-align: ${p.$align};`}
    ${(p) => p.$transform !== undefined && `text-transform: ${p.$transform};`}
    margin: 0;
`;
