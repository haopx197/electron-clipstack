import React from "react";
import styled, { css } from "styled-components";
import { LoadingSpinner } from "./LoadingSpinner";

type Variant = "primary" | "secondary" | "icon";

type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    children?: React.ReactNode;
    loading?: boolean;
    danger?: boolean;
    variant?: Variant;
};

export function Button({
    children,
    loading = false,
    danger = false,
    variant = "primary",
    disabled,
    ...rest
}: ButtonProps) {
    return (
        <StyledButton {...rest} $variant={variant} $danger={danger} disabled={disabled || loading}>
            {loading && variant === "primary" && <LoadingSpinner color="#fff" />}
            {children}
        </StyledButton>
    );
}

const variantStyles = {
    primary: css`
        background-color: #ffb11a;
        color: #fff;
        padding-inline: 12px;
    `,
    secondary: css`
        background-color: rgba(255, 177, 26, 0.4);
        color: #000;
        padding-inline: 12px;
    `,
    icon: css`
        background-color: transparent;
        color: #000;
        width: 32px;

        &:hover {
            background-color: #ebeef1;
        }
    `
};

const StyledButton = styled.button<{ $variant: Variant; $danger: boolean }>`
    display: inline-flex;
    flex-direction: row;
    gap: 8px;
    align-items: center;
    justify-content: center;
    height: 32px;
    border-radius: 32px;
    border: none;
    font-size: 12px;
    cursor: pointer;

    &:disabled {
        cursor: not-allowed;
    }

    ${(p) => variantStyles[p.$variant]}

    ${(p) =>
        p.$danger &&
        css`
            background-color: rgba(221, 69, 88, 0.2);
            color: #dd4558;
        `}
`;
