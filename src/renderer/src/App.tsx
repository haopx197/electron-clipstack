import styled from "styled-components";

import { AccessibilityBanner } from "./components";
import { TabView } from "./modules";

function App(): React.JSX.Element {
    return (
        <AppShell>
            <AccessibilityBanner />
            <TabView />
        </AppShell>
    );
}

const AppShell = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--color-white);
`;

export default App;
