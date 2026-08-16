import styled from "styled-components";

import { DragHandle } from "./components";
import { TabView, UpdateBanner, AccessibilityBanner } from "./modules";

function App() {
    return (
        <AppShell>
            <DragHandle />
            <AccessibilityBanner />
            <UpdateBanner />
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
