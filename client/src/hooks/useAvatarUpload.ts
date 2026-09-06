import { useState } from 'react';
import { API_BASE_URL } from '../config.js';

interface PresignResponse {
  url: string;
  key: string;
}

/**
 * Same two-step as room attachments - presign, then PUT straight to storage,
 * so the bytes never pass through Node - followed by a PATCH that records the
 * key against the account.
 */
export function useAvatarUpload(token: string) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function authed(path: string, init: RequestInit) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
    });
    if (!res.ok) {
      const problem = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(problem?.message ?? `request failed (${res.status})`);
    }
    return res.json();
  }

  async function upload(file: File): Promise<string | null> {
    setUploading(true);
    setError(null);
    try {
      const { url, key } = (await authed('/uploads/avatar-presign', {
        method: 'POST',
        body: JSON.stringify({ contentType: file.type || 'application/octet-stream' }),
      })) as PresignResponse;

      const put = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });
      if (!put.ok) throw new Error(`upload failed (${put.status})`);

      await authed('/users/me', { method: 'PATCH', body: JSON.stringify({ avatarKey: key }) });
      return key;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'upload failed');
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function clear(): Promise<boolean> {
    setUploading(true);
    setError(null);
    try {
      await authed('/users/me', { method: 'PATCH', body: JSON.stringify({ avatarKey: null }) });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not remove the picture');
      return false;
    } finally {
      setUploading(false);
    }
  }

  return { upload, clear, uploading, error };
}
