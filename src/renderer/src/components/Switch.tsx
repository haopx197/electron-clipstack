import styled from "styled-components";

type SwitchProps = {
    on: boolean;
    onChange?: (next: boolean) => void;
    "aria-label"?: string;
};

export function Switch({ on, onChange, ...rest }: SwitchProps) {
    return (
        <Track
            $on={on}
            role="switch"
            aria-checked={on}
            aria-label={rest["aria-label"]}
            onClick={(e) => {
                e.stopPropagation();
                onChange?.(!on);
            }}
        >
            <Knob $on={on} />
        </Track>
    );
}

const Track = styled.div<{ $on: boolean }>`
    flex-shrink: 0;
    width: 36px;
    height: 20px;
    border-radius: 10px;
    background: ${(p) => (p.$on ? "var(--color-primary)" : "var(--color-border)")};
    position: relative;
    transition: background 0.15s ease;
    cursor: pointer;
`;

const Knob = styled.div<{ $on: boolean }>`
    position: absolute;
    top: 2px;
    left: ${(p) => (p.$on ? "18px" : "2px")};
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--color-white);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
    transition: left 0.15s ease;
`;
