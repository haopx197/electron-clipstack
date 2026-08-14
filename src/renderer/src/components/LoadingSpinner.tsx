import styled, { keyframes } from "styled-components";

const spin = keyframes`
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
`;

const Spinner = styled.svg`
    animation: ${spin} 1s linear infinite;
    display: block;
`;

export function LoadingSpinner({ size = 16, color = "#ffb11a" }: { size?: number; color?: string }) {
    return (
        <Spinner width={size} height={size} viewBox="0 0 24 24" style={{ color }}>
            <rect x="10.5312" y="0" width="2.94731" height="7.15776" rx="1.47366" fill="currentColor" />
            <rect x="10.5312" y="16.8418" width="2.94731" height="7.15776" rx="1.47366" fill="currentColor" />
            <rect
                x="19.5"
                y="2.52734"
                width="2.94731"
                height="7.15776"
                rx="1.47366"
                fill="currentColor"
                transform="rotate(45 19.5 2.52734)"
            />
            <rect
                x="7.59375"
                y="14.4355"
                width="2.94731"
                height="7.15776"
                rx="1.47366"
                fill="currentColor"
                transform="rotate(45 7.59375 14.4355)"
            />
            <rect
                x="24.0039"
                y="10.5254"
                width="2.94731"
                height="7.15776"
                rx="1.47366"
                fill="currentColor"
                transform="rotate(90 24.0039 10.5254)"
            />
            <rect
                x="7.16016"
                y="10.5254"
                width="2.94731"
                height="7.15776"
                rx="1.47366"
                fill="currentColor"
                transform="rotate(90 7.16016 10.5254)"
            />
            <rect
                x="21.582"
                y="19.5"
                width="2.94731"
                height="7.15776"
                rx="1.47366"
                fill="currentColor"
                transform="rotate(135 21.582 19.5)"
            />
            <rect
                x="9.67188"
                y="7.58984"
                width="2.94731"
                height="7.15776"
                rx="1.47366"
                fill="currentColor"
                transform="rotate(135 9.67188 7.58984)"
            />
        </Spinner>
    );
}
