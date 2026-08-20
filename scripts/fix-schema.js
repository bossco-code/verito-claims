const fs = require("fs");
const content = fs.readFileSync("src/convex/schema.ts", "utf8");

// Replace ROLES to add PROVIDER
let updated = content.replace(
  '  MEMBER: "member",\n} as const;',
  '  MEMBER: "member",\n  PROVIDER: "provider",\n} as const;'
);

// Replace roleValidator to add PROVIDER
updated = updated.replace(
  '  v.literal(ROLES.MEMBER),\n);',
  '  v.literal(ROLES.MEMBER),\n  v.literal(ROLES.PROVIDER),\n);'
);

if (updated === content) {
  console.log("ERROR: no changes made");
  process.exit(1);
}

fs.writeFileSync("src/convex/schema.ts", updated);
console.log("Done.");
