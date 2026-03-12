import { Routes, Route } from "react-router-dom";
import styled from "styled-components";

import { IdentityContext, useIdentityResolver } from "./hooks/useIdentity";
import { ActiveTribeContext, useActiveTribeResolver } from "./hooks/useActiveTribe";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { TribePage } from "./pages/TribePage";
import { TribesListPage } from "./pages/TribesListPage";
import { ContractBoard } from "./pages/ContractBoard";
import { ForgePlanner } from "./pages/ForgePlanner";
import { EventExplorer } from "./pages/EventExplorer";

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const Main = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
`;

const Content = styled.main`
  flex: 1;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.lg};
`;

export default function App() {
  const identity = useIdentityResolver();
  const activeTribe = useActiveTribeResolver();

  return (
    <IdentityContext.Provider value={identity}>
      <ActiveTribeContext.Provider value={activeTribe}>
        <Shell>
          <Header />
          <Main>
            <Sidebar />
            <Content>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/tribes" element={<TribesListPage />} />
                <Route path="/tribe/:tribeId" element={<TribePage />} />
                <Route path="/jobs" element={<ContractBoard />} />
                <Route path="/forge" element={<ForgePlanner />} />
                <Route path="/events" element={<EventExplorer />} />
              </Routes>
            </Content>
          </Main>
        </Shell>
      </ActiveTribeContext.Provider>
    </IdentityContext.Provider>
  );
}
