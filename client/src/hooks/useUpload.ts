import { useState } from 'react';
import { API_BASE_URL } from '../config.js';

interface PresignResponse {
  url: string;
  key: string;
}

/**
 * Presign, then PUT the bytes straight to MinIO. The file never goes
 * through our Node processes - they only ever see the resulting object key.
 */
export function useUpload(token: string, roomId: string | null) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<string | null> {
    if (!roomId) return null;
    setUploading(true);
    setError(null);
    try {
      const presignRes = await fetch(`${API_BASE_URL}/uploads/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roomId, contentType: file.type || 'application/octet-stream' }),
      });
      if (!presignRes.ok) throw new Error(`could not get an upload URL (${presignRes.status})`);
      const { url, key } = (await presignRes.json()) as PresignResponse;

      const putRes = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      if (!putRes.ok) throw new Error(`upload failed (${putRes.status})`);

      return key;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'upload failed');
      return null;
    } finally {
      setUploading(false);
    }
  }

  return { upload, uploading, error };
}
