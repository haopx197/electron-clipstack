import styled from "styled-components";

import { TabView } from "./modules";

function App(): React.JSX.Element {
    return (
        <AppShell>
            <TabView />
        </AppShell>
    );
}

const AppShell = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-bg);
`;

export default App;
