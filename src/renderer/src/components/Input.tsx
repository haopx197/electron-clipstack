import React from "react";
import styled, { css } from "styled-components";

import { Flex } from "./Flex";
import { Typography } from "./Typography";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
    error?: string | null;
    label?: React.ReactNode;
    labelIcon?: React.ReactNode;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
    { error, label, labelIcon, ...rest },
    ref
) {
    return (
        <>
            {label && (
                <Flex gap={8} style={{ marginBottom: 8 }}>
                    {labelIcon}
                    <Typography size={12} weight="medium" transform="uppercase">
                        {label}
                    </Typography>
                </Flex>
            )}
            <StyledInput ref={ref} $error={!!error} {...rest} />
            {error && <ErrorText>{error}</ErrorText>}
        </>
    );
});

const StyledInput = styled.input<{ $error: boolean }>`
    display: block;
    width: 100%;
    height: 44px;
    padding-inline: 16px;
    border-radius: 12px;
    border: 1px solid ${(p) => (p.$error ? "var(--color-error)" : "var(--color-border)")};
    color: var(--color-text-strong);
    font-family: var(--font);
    font-size: inherit;
    font-weight: 400;
    outline: none;
    cursor: pointer;
    transition:
        border-color 0.12s ease,
        box-shadow 0.12s ease;

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    &[type="number"] {
        -moz-appearance: textfield;
        appearance: textfield;
    }

    &:focus {
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
    }

    ${(p) =>
        p.$error &&
        css`
            &:focus {
                border-color: var(--color-error);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-error) 15%, transparent);
            }
        `}
`;

const ErrorText = styled.div`
    margin-top: 4px;
    font-size: 12px;
    color: var(--color-error);
`;
