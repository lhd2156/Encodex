const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanup() {
  console.log('=== CLEANING UP STALE SHARE METADATA ===\n');

  // Get all non-deleted files
  const activeFiles = await prisma.file.findMany({
    where: { isDeleted: false },
    select: { id: true, name: true, ownerEmail: true }
  });
  const activeFileIds = new Set(activeFiles.map(f => f.id));
  console.log(`Found ${activeFileIds.size} active (non-deleted) files`);

  // Get all deleted files (in trash)
  const deletedFiles = await prisma.file.findMany({
    where: { isDeleted: true },
    select: { id: true, name: true, ownerEmail: true }
  });
  const deletedFileIds = new Set(deletedFiles.map(f => f.id));
  console.log(`Found ${deletedFileIds.size} deleted files (in trash)`);

  // Clean up TempDeletedShare records for files that are NOT in trash
  const tempDeleted = await prisma.tempDeletedShare.findMany();
  const staleTempDeleted = tempDeleted.filter(t => activeFileIds.has(t.fileId));
  const orphanTempDeleted = tempDeleted.filter(t => !activeFileIds.has(t.fileId) && !deletedFileIds.has(t.fileId));
  
  if (staleTempDeleted.length > 0) {
    console.log(`\n🧹 Found ${staleTempDeleted.length} stale TempDeletedShare records (file not in trash)`);
    staleTempDeleted.forEach(t => {
      const file = activeFiles.find(f => f.id === t.fileId);
      console.log(`   - ${t.fileId} "${file?.name || '?'}" -> ${t.recipientEmail}`);
    });
    
    const deleted = await prisma.tempDeletedShare.deleteMany({
      where: {
        fileId: { in: staleTempDeleted.map(t => t.fileId) }
      }
    });
    console.log(`   ✅ Deleted ${deleted.count} stale TempDeletedShare records`);
  } else {
    console.log('\n✅ No stale TempDeletedShare records found');
  }
  
  if (orphanTempDeleted.length > 0) {
    console.log(`\n🧹 Found ${orphanTempDeleted.length} orphan TempDeletedShare records (file doesn't exist)`);
    orphanTempDeleted.forEach(t => {
      console.log(`   - ${t.fileId} -> ${t.recipientEmail}`);
    });
    
    const deleted = await prisma.tempDeletedShare.deleteMany({
      where: {
        id: { in: orphanTempDeleted.map(t => t.id) }
      }
    });
    console.log(`   ✅ Deleted ${deleted.count} orphan TempDeletedShare records`);
  } else {
    console.log('\n✅ No orphan TempDeletedShare records found');
  }

  // Clean up HiddenShare records for files that don't exist in any share
  const allShares = await prisma.share.findMany({ select: { fileId: true } });
  const sharedFileIds = new Set(allShares.map(s => s.fileId));
  
  const hiddenShares = await prisma.hiddenShare.findMany();
  const orphanHidden = hiddenShares.filter(h => !sharedFileIds.has(h.fileId));
  
  if (orphanHidden.length > 0) {
    console.log(`\n🧹 Found ${orphanHidden.length} orphan HiddenShare records (share no longer exists)`);
    orphanHidden.forEach(h => {
      console.log(`   - ${h.fileId} -> ${h.recipientEmail}`);
    });
    
    const deleted = await prisma.hiddenShare.deleteMany({
      where: {
        id: { in: orphanHidden.map(h => h.id) }
      }
    });
    console.log(`   ✅ Deleted ${deleted.count} orphan HiddenShare records`);
  } else {
    console.log('\n✅ No orphan HiddenShare records found');
  }

  // Ask user if they want to clear ALL hidden shares (for testing)
  console.log('\n=== OPTIONAL: Clear ALL HiddenShare records? ===');
  console.log('This would make all previously hidden shares visible again.');
  console.log(`Currently ${hiddenShares.length} HiddenShare records exist.`);
  console.log('Run with: node scripts/cleanup-stale-metadata.js --clear-hidden');
  
  if (process.argv.includes('--clear-hidden')) {
    const deleted = await prisma.hiddenShare.deleteMany({});
    console.log(`\n✅ Cleared ALL ${deleted.count} HiddenShare records`);
  }

  await prisma.$disconnect();
  console.log('\n=== CLEANUP COMPLETE ===');
}

cleanup().catch(console.error);
