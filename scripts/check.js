import process from 'node:process';

const [major] = process.versions.node.split('.').map(Number);

if (Number.isNaN(major) || major < 22) {
  console.error(
    `Kick Public API SDK requires Node.js 22 or newer. Current version: ${process.version}`,
  );
  process.exit(1);
}

if (typeof globalThis.fetch !== 'function') {
  console.error(
    'Fetch API is not available in this Node.js runtime. Ensure you run Node.js 18.17+ or enable experimental fetch.',
  );
  process.exit(1);
}

console.log(`Environment check passed. Node.js ${process.version} provides fetch support.`);
