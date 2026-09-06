import { AuthProvider, useAuth } from './auth/AuthProvider.js';
import { SocketProvider } from './socket/SocketProvider.js';
import { ThemeProvider } from './ui/ThemeProvider.js';
import { ToastProvider } from './ui/ToastProvider.js';
import { AuthPage } from './pages/AuthPage.js';
import { ChatPage } from './pages/ChatPage.js';
import { Spinner } from './ui/primitives.js';
import { ErrorBoundary } from './ui/ErrorBoundary.js';

function Routes() {
  const { user, token, ready } = useAuth();

  // Wait for the stored session to be read, otherwise a refresh flashes the
  // login screen before restoring.
  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-content-muted">
        <Spinner />
      </div>
    );
  }

  if (!user || !token) return <AuthPage />;

  return (
    <SocketProvider token={token}>
      <ChatPage />
    </SocketProvider>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <Routes />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
