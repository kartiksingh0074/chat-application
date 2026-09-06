import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './primitives.js';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, one thrown render error unmounts the whole tree and leaves a
 * blank page with no way back. React only supports catching those in a class
 * component, so this is the one class in the client.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('render error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-base font-semibold text-content">Something broke</p>
        <p className="max-w-sm text-sm text-content-muted">
          The app hit an unexpected error. Reloading usually clears it.
        </p>
        <pre className="max-w-full overflow-x-auto rounded-lg bg-surface-sunken p-3 text-left font-mono text-xs text-content-muted">
          {error.message}
        </pre>
        <div className="flex gap-2">
          <Button onClick={() => this.setState({ error: null })} variant="secondary">
            Try again
          </Button>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    );
  }
}
