const fs=require('fs');
const s=fs.readFileSync('hooks/useVault.ts','utf8');
console.log('backticks:', (s.match(/`/g)||[]).length);
console.log('singleQuotes:', (s.match(/'/g)||[]).length);
console.log('doubleQuotes:', (s.match(/"/g)||[]).length);
console.log('parenOpen:', (s.match(/\(/g)||[]).length, 'parenClose:', (s.match(/\)/g)||[]).length);
console.log('bracesOpen:', (s.match(/\{/g)||[]).length, 'bracesClose:', (s.match(/\}/g)||[]).length);
