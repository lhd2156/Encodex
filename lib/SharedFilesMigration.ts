/**
 * SHARED FILES RECOVERY & MIGRATION SCRIPT
 * 
 * Run this ONCE after deploying the fixed sharedFilesManager.ts
 * This will safely recover any corrupted data and migrate users to the new system.
 * 
 * Usage:
 * 1. Add this to a utility file in your project
 * 2. Import and call migrateSharedFiles() on app initialization
 * 3. Or run directly in browser console for immediate fix
 */

export interface MigrationResult {
  success: boolean;
  message: string;
  recoveredShares?: number;
  cleanedTempDeleted?: number;
  removedOrphans?: number;
}

/**
 * Migrate and fix all shared files data
 */
export function migrateSharedFiles(): MigrationResult {
  console.log('\n🔄 === STARTING SHARED FILES MIGRATION ===\n');
  
  try {
    let recoveredShares = 0;
    let cleanedTempDeleted = 0;
    let removedOrphans = 0;
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Fix corrupted shared_files_global
    // ═══════════════════════════════════════════════════════════════
    console.log('📦 Step 1: Checking shared_files_global...');
    const rawShared = localStorage.getItem('shared_files_global');
    
    if (rawShared) {
      try {
        const parsed = JSON.parse(rawShared);
        
        if (!Array.isArray(parsed)) {
          console.warn('⚠️ Found corrupted shared_files_global (not an array)');
          console.log('   Old value:', parsed);
          
          // Try to salvage any data
          if (typeof parsed === 'object' && parsed !== null) {
            console.log('   Attempting to convert object to array...');
            const entries = Object.values(parsed).filter((item: any) => 
              item && 
              typeof item === 'object' && 
              item.fileId && 
              item.recipientEmail
            );
            
            if (entries.length > 0) {
              localStorage.setItem('shared_files_global', JSON.stringify(entries));
              recoveredShares = entries.length;
              console.log(`✅ Recovered ${recoveredShares} share(s) from corrupted data`);
            } else {
              localStorage.setItem('shared_files_global', JSON.stringify([]));
              console.log('⚠️ Could not recover data, reset to empty array');
            }
          } else {
            localStorage.setItem('shared_files_global', JSON.stringify([]));
            console.log('⚠️ Data unrecoverable, reset to empty array');
          }
        } else {
          console.log(`✅ shared_files_global is valid (${parsed.length} shares)`);
        }
      } catch (e) {
        console.error('❌ Failed to parse shared_files_global:', e);
        localStorage.setItem('shared_files_global', JSON.stringify([]));
        console.log('⚠️ Reset to empty array due to parse error');
      }
    } else {
      console.log('ℹ️ No shared_files_global found (first time setup)');
      localStorage.setItem('shared_files_global', JSON.stringify([]));
    }
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Clean up temp_deleted_shares lists
    // ═══════════════════════════════════════════════════════════════
    console.log('\n🗑️ Step 2: Cleaning temp_deleted lists...');
    const allKeys = Object.keys(localStorage);
    const tempDeletedKeys = allKeys.filter(k => k.startsWith('temp_deleted_shares_'));
    
    if (tempDeletedKeys.length > 0) {
      console.log(`   Found ${tempDeletedKeys.length} temp_deleted list(s)`);
      
      tempDeletedKeys.forEach(key => {
        try {
          const value = localStorage.getItem(key);
          if (!value) {
            localStorage.removeItem(key);
            cleanedTempDeleted++;
            return;
          }
          
          const parsed = JSON.parse(value);
          
          if (!Array.isArray(parsed)) {
            console.warn(`   ⚠️ Corrupted ${key} (not an array), fixing...`);
            localStorage.setItem(key, JSON.stringify([]));
            cleanedTempDeleted++;
          } else {
            // Remove duplicates
            const unique = [...new Set(parsed)];
            if (unique.length !== parsed.length) {
              localStorage.setItem(key, JSON.stringify(unique));
              console.log(`   🧹 Removed duplicates from ${key}`);
            }
          }
        } catch (e) {
          console.error(`   ❌ Error processing ${key}:`, e);
          localStorage.setItem(key, JSON.stringify([]));
          cleanedTempDeleted++;
        }
      });
      
      console.log(`✅ Cleaned ${cleanedTempDeleted} temp_deleted list(s)`);
    } else {
      console.log('   ℹ️ No temp_deleted lists found');
    }
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Clean up hidden_shares lists
    // ═══════════════════════════════════════════════════════════════
    console.log('\n🚫 Step 3: Cleaning hidden_shares lists...');
    const hiddenKeys = allKeys.filter(k => k.startsWith('hidden_shares_'));
    
    if (hiddenKeys.length > 0) {
      console.log(`   Found ${hiddenKeys.length} hidden_shares list(s)`);
      
      hiddenKeys.forEach(key => {
        try {
          const value = localStorage.getItem(key);
          if (!value) {
            localStorage.removeItem(key);
            return;
          }
          
          const parsed = JSON.parse(value);
          
          if (!Array.isArray(parsed)) {
            console.warn(`   ⚠️ Corrupted ${key}, fixing...`);
            localStorage.setItem(key, JSON.stringify([]));
          }
        } catch (e) {
          console.error(`   ❌ Error processing ${key}:`, e);
          localStorage.setItem(key, JSON.stringify([]));
        }
      });
      
      console.log('✅ Cleaned hidden_shares lists');
    } else {
      console.log('   ℹ️ No hidden_shares lists found');
    }
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Clean orphaned shared file data
    // ═══════════════════════════════════════════════════════════════
    console.log('\n📦 Step 4: Cleaning orphaned shared file data...');
    const sharedDataKeys = allKeys.filter(k => k.startsWith('shared_file_data_'));
    
    if (sharedDataKeys.length > 0) {
      console.log(`   Found ${sharedDataKeys.length} shared file data entries`);
      
      // Get all valid file IDs from shared_files_global
      const sharedFilesRaw = localStorage.getItem('shared_files_global');
      const validFileIds = new Set<string>();
      
      if (sharedFilesRaw) {
        try {
          const sharedFiles = JSON.parse(sharedFilesRaw);
          if (Array.isArray(sharedFiles)) {
            sharedFiles.forEach((entry: any) => {
              if (entry.fileId) validFileIds.add(entry.fileId);
            });
          }
        } catch (e) {
          console.error('   ❌ Error parsing shared_files_global for orphan check');
        }
      }
      
      // Remove orphaned data
      sharedDataKeys.forEach(key => {
        // Extract fileId from key: shared_file_data_owner_to_recipient_fileId
        const parts = key.split('_');
        const fileId = parts[parts.length - 1];
        
        if (!validFileIds.has(fileId)) {
          console.log(`   🗑️ Removing orphaned data for ${fileId}`);
          localStorage.removeItem(key);
          removedOrphans++;
        }
      });
      
      if (removedOrphans > 0) {
        console.log(`✅ Removed ${removedOrphans} orphaned file data entries`);
      } else {
        console.log('✅ No orphaned data found');
      }
    } else {
      console.log('   ℹ️ No shared file data found');
    }
    
    // ═══════════════════════════════════════════════════════════════
    // FINAL REPORT
    // ═══════════════════════════════════════════════════════════════
    console.log('\n✅ === MIGRATION COMPLETE ===\n');
    console.log('Summary:');
    console.log(`   📤 Recovered shares: ${recoveredShares}`);
    console.log(`   🧹 Cleaned temp_deleted: ${cleanedTempDeleted}`);
    console.log(`   🗑️ Removed orphans: ${removedOrphans}`);
    console.log('');
    
    // Trigger a sync event to refresh all components
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('shared-files-updated'));
      console.log('🔔 Triggered sync event');
    }
    
    return {
      success: true,
      message: 'Migration completed successfully',
      recoveredShares,
      cleanedTempDeleted,
      removedOrphans
    };
    
  } catch (error) {
    console.error('\n❌ === MIGRATION FAILED ===\n');
    console.error('Error:', error);
    
    return {
      success: false,
      message: `Migration failed: ${error}`
    };
  }
}

/**
 * Clear ALL shared files data (nuclear option)
 * Use this only if migration fails and you want to start fresh
 */
export function clearAllSharedData(): MigrationResult {
  console.warn('\n⚠️ === CLEARING ALL SHARED DATA ===\n');
  console.warn('This will remove ALL shared files data!');
  
  try {
    const keys = Object.keys(localStorage);
    let removed = 0;
    
    // Remove all shared-related data
    keys.forEach(key => {
      if (
        key === 'shared_files_global' ||
        key.startsWith('temp_deleted_shares_') ||
        key.startsWith('hidden_shares_') ||
        key.startsWith('shared_file_data_')
      ) {
        localStorage.removeItem(key);
        removed++;
        console.log(`   🗑️ Removed ${key}`);
      }
    });
    
    // Reset to empty state
    localStorage.setItem('shared_files_global', JSON.stringify([]));
    
    console.log(`\n✅ Cleared ${removed} items`);
    console.log('⚠️ Users will need to re-share files\n');
    
    return {
      success: true,
      message: `Cleared ${removed} items`,
      removedOrphans: removed
    };
    
  } catch (error) {
    console.error('❌ Clear failed:', error);
    return {
      success: false,
      message: `Clear failed: ${error}`
    };
  }
}

/**
 * Run migration automatically on app load (recommended)
 */
export function autoMigrate() {
  // Only run once per session
  const migrationKey = 'shared_files_migration_v1_done';
  
  if (typeof window !== 'undefined') {
    const alreadyDone = sessionStorage.getItem(migrationKey);
    
    if (!alreadyDone) {
      console.log('🔄 Running automatic shared files migration...');
      const result = migrateSharedFiles();
      
      if (result.success) {
        sessionStorage.setItem(migrationKey, 'true');
        console.log('✅ Migration marked as complete for this session');
      }
      
      return result;
    } else {
      console.log('ℹ️ Migration already completed this session');
      return { success: true, message: 'Already migrated' };
    }
  }
  
  return { success: false, message: 'Not in browser environment' };
}

// If loaded directly in browser, make functions available globally
if (typeof window !== 'undefined') {
  (window as any).migrateSharedFiles = migrateSharedFiles;
  (window as any).clearAllSharedData = clearAllSharedData;
  (window as any).autoMigrate = autoMigrate;
  
  console.log('\n📦 Shared Files Migration loaded!');
  console.log('\n📖 Usage:');
  console.log('   migrateSharedFiles()  - Run migration/recovery');
  console.log('   clearAllSharedData()  - Clear everything (nuclear option)');
  console.log('   autoMigrate()         - Auto-run migration once per session');
  console.log('\n');
}

export default {
  migrateSharedFiles,
  clearAllSharedData,
  autoMigrate
};
