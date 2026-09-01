import { useState } from 'react';
import { SocketProvider } from './socket/SocketProvider.js';
import { LoginForm, type LoggedInUser } from './components/LoginForm.js';
import { ChatShell } from './components/ChatShell.js';

export function App() {
  const [user, setUser] = useState<LoggedInUser | null>(null);

  if (!user) {
    return <LoginForm onLogin={setUser} />;
  }

  return (
    <SocketProvider token={user.token}>
      <ChatShell token={user.token} userId={user.id} username={user.username} />
    </SocketProvider>
  );
}
