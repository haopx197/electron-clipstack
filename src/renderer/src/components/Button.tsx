import React from "react";
import styled, { css } from "styled-components";
import { LoadingSpinner } from "./LoadingSpinner";

type Variant = "primary" | "secondary" | "icon";

type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    children?: React.ReactNode;
    loading?: boolean;
    variant?: Variant;
};

export function Button({ children, loading = false, variant = "primary", disabled, ...rest }: ButtonProps) {
    return (
        <StyledButton {...rest} $variant={variant} disabled={disabled || loading}>
            {loading && variant === "primary" && <LoadingSpinner color="#fff" />}
            {children}
        </StyledButton>
    );
}

const variantStyles = {
    primary: css`
        background-color: #0493e5;
        color: #fff;
        padding-inline: 12px;
    `,
    secondary: css`
        background-color: rgba(4, 147, 229, 0.1);
        color: #000;
        padding-inline: 12px;
    `,
    icon: css`
        background-color: transparent;
        color: #000;
        width: 36px;
    `
};

const StyledButton = styled.button<{ $variant: Variant }>`
    display: inline-flex;
    flex-direction: row;
    gap: 8px;
    align-items: center;
    justify-content: center;
    height: 36px;
    border-radius: 36px;
    border: none;
    font-size: 14px;
    cursor: pointer;

    &:disabled {
        cursor: not-allowed;
    }

    ${(p) => variantStyles[p.$variant]}
`;
