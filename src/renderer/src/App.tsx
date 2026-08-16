import styled from "styled-components";

import { AccessibilityBanner, DragHandle, UpdateBanner } from "./components";
import { TabView } from "./modules";

function App() {
    return (
        <AppShell>
            <DragHandle />
            <UpdateBanner />
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
