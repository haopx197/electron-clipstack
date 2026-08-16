import type { ReactNode } from "react";
import styled from "styled-components";

import { Switch } from "./Switch";
import { Typography } from "./Typography";

type SettingToggleProps = {
    on: boolean;
    onChange: (next: boolean) => void;
    title: ReactNode;
    hint?: ReactNode;
};

export function SettingToggle({ on, onChange, title, hint }: SettingToggleProps) {
    return (
        <Row onClick={() => onChange(!on)} role="button">
            <TextGroup>
                <Typography size={14} weight="medium" color="var(--color-text-strong)">
                    {title}
                </Typography>
                {hint && (
                    <Typography size={12} style={{ marginTop: 2 }}>
                        {hint}
                    </Typography>
                )}
            </TextGroup>
            <Switch on={on} onChange={onChange} />
        </Row>
    );
}

const Row = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    cursor: pointer;
    transition: border-color 0.12s ease;

    &:hover {
        border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
    }
`;

const TextGroup = styled.div`
    flex: 1;
    min-width: 0;
`;
