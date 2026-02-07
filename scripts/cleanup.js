const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // First, let's see ALL files and their ownership
  const allFiles = await prisma.file.findMany({
    select: { id: true, name: true, ownerEmail: true, userId: true, isDeleted: true }
  });
  
  console.log('All files in database:');
  allFiles.forEach(f => {
    console.log(`  - "${f.name}" | owner: ${f.ownerEmail} | userId: ${f.userId} | deleted: ${f.isDeleted}`);
  });
  
  // Find all users
  const users = await prisma.user.findMany({
    select: { id: true, email: true }
  });
  
  console.log('\nAll users:');
  users.forEach(u => console.log(`  - ${u.email} (ID: ${u.id})`));
  
  // Find files where ownerEmail doesn't match the user's email for that userId
  const userMap = new Map(users.map(u => [u.id, u.email.toLowerCase()]));
  
  const mismatched = allFiles.filter(f => {
    const userEmail = userMap.get(f.userId);
    return userEmail && userEmail !== f.ownerEmail.toLowerCase();
  });
  
  console.log('\nMismatched files (userId vs ownerEmail):');
  mismatched.forEach(f => {
    const userEmail = userMap.get(f.userId);
    console.log(`  - "${f.name}" | userId points to: ${userEmail} | but ownerEmail is: ${f.ownerEmail}`);
  });
  
  if (mismatched.length > 0) {
    console.log('\nDeleting mismatched files...');
    for (const file of mismatched) {
      await prisma.share.deleteMany({ where: { fileId: file.id } });
      await prisma.userFavorite.deleteMany({ where: { fileId: file.id } }).catch(() => {});
      await prisma.tempDeletedShare.deleteMany({ where: { fileId: file.id } }).catch(() => {});
      await prisma.hiddenShare.deleteMany({ where: { fileId: file.id } }).catch(() => {});
      await prisma.receiverTrashedShare.deleteMany({ where: { fileId: file.id } }).catch(() => {});
      await prisma.file.delete({ where: { id: file.id } });
      console.log(`  Deleted: "${file.name}"`);
    }
  }
  
  console.log('\nCleanup complete!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
