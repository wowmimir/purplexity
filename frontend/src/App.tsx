
import "./index.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/" element={<Dashboard />} />
        <Route path="/c/:conversationId" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
