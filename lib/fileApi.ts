// lib/fileApi.ts
// API helper for file operations with backend

import { getAuthToken } from './session';

export interface FileUploadData {
  encryptedData: number[];
  iv: number[];
  wrappedKey: number[];
  fileName: string;
  mimeType: string;
  size: number;
}

export interface FileMetadata {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  isFavorite: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function uploadFile(data: FileUploadData): Promise<{ success: boolean; fileId?: string; error?: string }> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch('/api/files/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Upload failed');
  }

  return response.json();
}

export async function listFiles(): Promise<{ files: FileMetadata[] }> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch('/api/files', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch files');
  }

  return response.json();
}

export async function getFile(fileId: string) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`/api/files/${fileId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('File not found');
  }

  return response.json();
}

export async function downloadFile(fileId: string) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`/api/files/download/${fileId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Download failed');
  }

  return response.json();
}

export async function deleteFile(fileId: string): Promise<{ success: boolean }> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`/api/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Delete failed');
  }

  return response.json();
}

export async function toggleFavorite(fileId: string, isFavorite: boolean): Promise<{ success: boolean }> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`/api/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ isFavorite })
  });

  if (!response.ok) {
    throw new Error('Update failed');
  }

  return response.json();
}

export async function updateFile(fileId: string, updates: { isFavorite?: boolean; isDeleted?: boolean }): Promise<{ success: boolean }> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`/api/files/${fileId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(updates)
  });

  if (!response.ok) {
    throw new Error('Update failed');
  }

  return response.json();
}