// Generate the Argon2id hash to put in MASTER_PASSWORD_HASH.
//
//   npm run auth:hash -- "your master password here"
//
// Quote the password. Note that it will be visible in your shell history —
// clear it afterwards if that bothers you.
import { hash } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

const password = process.argv[2];

if (!password) {
  console.error('Usage: npm run auth:hash -- "your master password here"');
  process.exit(1);
}

if (password.length < 12) {
  console.error(
    `That password is ${password.length} characters. Use at least 12 — it is the only thing between the internet-facing side of this box and your data.`,
  );
  process.exit(1);
}

// Defaults follow the OWASP recommendation for Argon2id: 19 MiB, 2 passes.
const digest = await hash(password, {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

// Next's env loader does shell-style variable expansion, so an unescaped
// Argon2 hash ($argon2id$v=19$m=...) is silently gutted and every login fails.
// Quoting does not help — only escaping does. Emit it ready to paste.
const escaped = digest.replaceAll('$', '\\$');

console.log('\nAdd these to .env.local exactly as printed:\n');
console.log(`MASTER_PASSWORD_HASH=${escaped}`);
console.log(`SESSION_SECRET=${randomBytes(32).toString('hex')}`);
console.log('\n(The backslashes are required. Do not remove them or add quotes.)\n');
