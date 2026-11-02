import React from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { walletConfig } from "./lib/wallet";
import App from "./App";
import "./style.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="recovery">
          <h1>Squeek Streak</h1>
          <p>
            The game could not load. Your saved points have not been changed.
          </p>
          <button className="button primary" onClick={() => location.reload()}>
            Reload game
          </button>
        </main>
      );
    return this.props.children;
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <WagmiProvider config={walletConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </ErrorBoundary>,
);
