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
    height: 50px;
    padding-inline: 12px;
    border-radius: 16px;
    border: 1px solid ${(p) => (p.$error ? "var(--color-error)" : "var(--color-border)")};
    color: var(--color-text-strong);
    font-size: inherit;
    font-weight: 500;
    outline: none;
    cursor: pointer;
    transition:
        border-color 0.12s ease,
        box-shadow 0.12s ease;

    &:focus {
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px rgba(4, 147, 229, 0.15);
    }

    ${(p) =>
        p.$error &&
        css`
            &:focus {
                border-color: var(--color-error);
                box-shadow: 0 0 0 3px rgba(221, 69, 88, 0.15);
            }
        `}
`;

const ErrorText = styled.div`
    margin-top: 4px;
    font-size: 12px;
    color: var(--color-error);
`;
