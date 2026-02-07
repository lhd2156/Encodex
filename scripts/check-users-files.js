const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('=== CHECKING USER-FILE INTEGRITY ===\n');
  
  const users = await prisma.user.findMany();
  const files = await prisma.file.findMany({
    where: { isDeleted: false }
  });
  
  console.log('Users:');
  const userMap = new Map();
  users.forEach(u => {
    console.log(`  ${u.email} => userId: ${u.id}`);
    userMap.set(u.id, u.email);
  });
  
  console.log('\nFiles and ownership:');
  files.forEach(f => {
    const expectedOwner = userMap.get(f.userId);
    const ownerMatch = expectedOwner?.toLowerCase() === f.ownerEmail?.toLowerCase();
    const status = ownerMatch ? '✓' : `❌ MISMATCH (userId points to ${expectedOwner})`;
    console.log(`  "${f.name}" | userId: ${f.userId} | ownerEmail: ${f.ownerEmail} ${status}`);
  });
  
  console.log('\n=== CHECKING FOR userId MISMATCHES ===');
  let mismatches = 0;
  files.forEach(f => {
    const expectedOwner = userMap.get(f.userId);
    if (expectedOwner && expectedOwner.toLowerCase() !== f.ownerEmail?.toLowerCase()) {
      console.log(`❌ FILE MISMATCH: "${f.name}"`);
      console.log(`   userId ${f.userId} belongs to: ${expectedOwner}`);
      console.log(`   But ownerEmail is: ${f.ownerEmail}`);
      mismatches++;
    }
  });
  
  if (mismatches === 0) {
    console.log('✅ No mismatches found - data is consistent');
  } else {
    console.log(`\n🚨 Found ${mismatches} mismatches!`);
  }
  
  await prisma.$disconnect();
}

run();
