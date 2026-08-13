import type { ReactNode } from "react";
import styled from "styled-components";

import emptyImage from "../assets/empty.png";

type EmptyProps = {
    children?: ReactNode;
};

export function Empty({ children }: EmptyProps): React.JSX.Element {
    return (
        <Wrapper>
            <Image src={emptyImage} alt="empty" />
            {children ? <div>{children}</div> : null}
        </Wrapper>
    );
}

const Wrapper = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    text-align: center;
    color: var(--color-text);
    font-size: 12px;
`;

const Image = styled.img`
    width: 100px;
    height: 100px;
    object-fit: contain;
`;
