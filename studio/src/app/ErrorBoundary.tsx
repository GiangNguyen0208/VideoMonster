import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, EmptyState } from "@/components/ui";
import { msg } from "@/i18n";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Studio crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const t = msg().errors;
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          title={t.crashedTitle}
          action={
            <Button variant="primary" onClick={() => window.location.reload()}>
              {t.reload}
            </Button>
          }
        >
          {t.crashedBody}
          <pre className="mt-3 overflow-x-auto rounded-control bg-surface-2 p-3 text-left font-mono text-xs text-text-3">
            {this.state.error.message}
          </pre>
        </EmptyState>
      </div>
    );
  }
}
