// lib/renameDebugger.ts
/**
 * Comprehensive logging for rename operations
 * This helps track every detail of the rename flow
 */

export interface RenameDebugInfo {
  timestamp: string;
  fileId: string;
  oldName: string;
  newName: string;
  isInTrash: boolean;
  isShared: boolean;
  isOwner: boolean;
  currentUser: string;
  owner?: string;
  action: string;
  metadata?: Record<string, any>;
}

class RenameDebugger {
  private logs: RenameDebugInfo[] = [];
  private enabled = true;

  log(info: RenameDebugInfo) {
    if (!this.enabled) return;

    const logEntry = {
      ...info,
      timestamp: new Date().toISOString(),
    };

    this.logs.push(logEntry);

    // Console output with clear formatting
    console.group(`🔄 [RENAME DEBUG] ${info.action}`);
    console.log('📝 File ID:', info.fileId);
    console.log('📛 Old Name:', info.oldName);
    console.log('✨ New Name:', info.newName);
    console.log('🗑️ In Trash:', info.isInTrash ? 'YES' : 'NO');
    console.log('📤 Shared:', info.isShared ? 'YES' : 'NO');
    console.log('👤 Is Owner:', info.isOwner ? 'YES' : 'NO');
    console.log('👤 Current User:', info.currentUser);
    if (info.owner) console.log('👤 Owner:', info.owner);
    if (info.metadata) {
      console.log('📊 Metadata:', info.metadata);
    }
    console.log('⏰ Timestamp:', info.timestamp);
    console.groupEnd();
  }

  logStateUpdate(context: string, fileId: string, newName: string, state: 'files' | 'deletedFiles') {
    console.log(`📝 [RENAME STATE] ${context}: Updated ${state} array for ${fileId} → "${newName}"`);
  }

  logPropagation(fileId: string, newName: string, willPropagate: boolean, reason: string) {
    if (willPropagate) {
      console.log(`📡 [RENAME PROPAGATE] File ${fileId} → "${newName}" WILL propagate. Reason: ${reason}`);
    } else {
      console.warn(`🚫 [RENAME BLOCK] File ${fileId} → "${newName}" will NOT propagate. Reason: ${reason}`);
    }
  }

  logSharedFilesManagerUpdate(fileId: string, newName: string, success: boolean) {
    if (success) {
      console.log(`✅ [SHARED_FILES_MGR] Updated metadata: ${fileId} → "${newName}"`);
    } else {
      console.error(`❌ [SHARED_FILES_MGR] Failed to update metadata: ${fileId} → "${newName}"`);
    }
  }

  logSyncTrigger(fileId: string, newName: string, reason: string) {
    console.log(`🔔 [RENAME SYNC] Triggering sync for ${fileId} → "${newName}". Reason: ${reason}`);
  }

  getLastLogs(count: number = 10): RenameDebugInfo[] {
    return this.logs.slice(-count);
  }

  getAllLogs(): RenameDebugInfo[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    console.log('🧹 [RENAME DEBUG] Logs cleared');
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    console.log(`🔧 [RENAME DEBUG] Logging ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }
}

export const renameDebugger = new RenameDebugger();

// Make it available in browser console for debugging
if (typeof window !== 'undefined') {
  (window as any).renameDebugger = renameDebugger;
}
