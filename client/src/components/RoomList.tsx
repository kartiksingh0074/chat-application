import type { Room } from '../hooks/useRooms.js';

interface RoomListProps {
  rooms: Room[];
  activeRoomId: string | null;
  onSelect: (roomId: string) => void;
}

export function RoomList({ rooms, activeRoomId, onSelect }: RoomListProps) {
  return (
    <div style={{ width: 160, borderRight: '1px solid #ccc', paddingRight: 8 }}>
      <h2 style={{ fontSize: 14, color: '#666' }}>Rooms</h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {rooms.map((room) => (
          <li key={room.id}>
            <button
              onClick={() => onSelect(room.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                border: 'none',
                background: room.id === activeRoomId ? '#eee' : 'transparent',
                fontWeight: room.id === activeRoomId ? 'bold' : 'normal',
                cursor: 'pointer',
              }}
            >
              {room.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
