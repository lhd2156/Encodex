const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
  console.log('=== SHARES DIAGNOSTIC ===\n');

  // All users
  const users = await prisma.user.findMany();
  console.log('Users:');
  users.forEach(u => {
    console.log(`  - ${u.email} (ID: ${u.id})`);
  });

  // All files
  const files = await prisma.file.findMany({ where: { isDeleted: false } });
  console.log('\nFiles:');
  files.forEach(f => {
    console.log(`  - "${f.name}" | ${f.isFolder ? 'folder' : 'file'} | owner: ${f.ownerEmail} | userId: ${f.userId}`);
  });

  // All shares
  const shares = await prisma.share.findMany({
    include: { file: true }
  });
  console.log('\n=== ALL SHARES ===');
  if (shares.length === 0) {
    console.log('  No shares exist');
  } else {
    shares.forEach(s => {
      console.log(`  Share ID: ${s.id}`);
      console.log(`    File: "${s.file?.name || 'DELETED'}" (ID: ${s.fileId})`);
      console.log(`    File Owner: ${s.file?.ownerEmail || 'N/A'}`);
      console.log(`    Parent Folder ID: ${s.parentFolderId || 'ROOT'}`);
      console.log(`    Shared TO: ${s.recipientEmail}`);
      console.log('');
    });
  }

  // Check temp_deleted shares (sender trashed)
  const tempDeleted = await prisma.tempDeletedShare.findMany();
  console.log('\n=== TEMP DELETED SHARES (sender trashed) ===');
  if (tempDeleted.length === 0) {
    console.log('  None');
  } else {
    tempDeleted.forEach(t => {
      console.log(`  File ${t.fileId} -> Recipient: ${t.recipientEmail} (deleted at: ${t.deletedByOwnerAt})`);
    });
  }

  // Check receiver trashed shares
  const receiverTrashed = await prisma.receiverTrashedShare.findMany();
  console.log('\n=== RECEIVER TRASHED SHARES ===');
  if (receiverTrashed.length === 0) {
    console.log('  None');
  } else {
    receiverTrashed.forEach(t => {
      console.log(`  File ${t.fileId} -> Recipient: ${t.recipientEmail}`);
    });
  }

  // Check hidden shares
  const hiddenShares = await prisma.hiddenShare.findMany();
  console.log('\n=== HIDDEN SHARES ===');
  if (hiddenShares.length === 0) {
    console.log('  None');
  } else {
    hiddenShares.forEach(h => {
      console.log(`  File ${h.fileId} -> User: ${h.recipientEmail}`);
    });
  }

  // Problematic: shares where owner == recipient
  console.log('\n=== SELF-SHARES (owner shared to themselves) ===');
  const selfShares = shares.filter(s => 
    s.file?.ownerEmail?.toLowerCase() === s.recipientEmail?.toLowerCase()
  );
  if (selfShares.length === 0) {
    console.log('  None');
  } else {
    selfShares.forEach(s => {
      console.log(`  PROBLEM: "${s.file?.name}" shared to its own owner - Share ID: ${s.id}`);
    });
  }

  // Problematic: orphan shares (no file)
  console.log('\n=== ORPHAN SHARES (file deleted) ===');
  const orphanShares = shares.filter(s => !s.file);
  if (orphanShares.length === 0) {
    console.log('  None');
  } else {
    orphanShares.forEach(s => {
      console.log(`  ORPHAN: Share ID ${s.id} for fileId ${s.fileId} - File no longer exists`);
    });
  }

  await prisma.$disconnect();
}

diagnose().catch(console.error);
