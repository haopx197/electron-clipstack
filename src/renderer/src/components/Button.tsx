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
        background-color: var(--color-primary);
        color: #fff;
        padding-inline: 12px;
    `,
    secondary: css`
        background-color: color-mix(in srgb, var(--color-primary) 40%, transparent);
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
            background-color: color-mix(in srgb, var(--color-error) 20%, transparent);
            color: var(--color-error);
        `}
`;
