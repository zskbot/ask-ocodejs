export type CommandStatus = 'success' | 'error' | 'running' | 'info' | 'warning';

export interface CommandHistoryItem {
  id: string;
  timestamp: string;
  cwd: string;
  command: string;
  output: {
    type: 'text' | 'json' | 'markdown' | 'table' | 'error' | 'code';
    content: string;
    jsonContent?: Record<string, unknown>;
    tableData?: { headers: string[]; rows: string[][] };
    language?: string;
  };
  status: CommandStatus;
  durationMs?: number;
}

export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  language?: string;
  content?: string;
  children?: ProjectFile[];
}

export interface SavedSession {
  id: string;
  name: string;
  timestamp: string;
  commandCount: number;
  status: 'active' | 'synced' | 'archived';
  encryptedHash: string;
}

export interface DeviceSync {
  id: string;
  name: string;
  type: 'mobile' | 'tablet' | 'desktop';
  status: 'synced' | 'connecting' | 'offline';
  lastSyncTime: string;
  ipAddress: string;
}

export interface WatsonMetrics {
  nodeEfficiency: number; // e.g. 92%
  queryLatencyMs: number; // e.g. 14ms
  anomaliesDetected: number;
  aiConfidence: number; // e.g. 0.992
  recordsProcessed: number;
  activeNodes: number;
  statusText: 'Optimal' | 'Warning' | 'Syncing' | 'High Load';
}

export interface UserProfile {
  username: string;
  role: string;
  avatarUrl?: string;
  authProvider: 'github' | 'google' | 'gitlab' | 'guest';
  is2FAEnabled: boolean;
  repoConnected?: string;
  email?: string;
}

export interface PushNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'ai';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}
