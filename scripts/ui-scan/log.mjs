// Appends one hill-climb entry to docs/ui-hill-climb/log.jsonl.
//
//   node scripts/ui-scan/log.mjs '{"group":"mail","step":3,"change":"…","gate":"PASS","accepted":true}'

import fs from "node:fs";

const entry = { kind: "step", ...JSON.parse(process.argv[2]) };
entry.at = new Date().toISOString();
fs.appendFileSync(
	new URL("../../docs/ui-hill-climb/log.jsonl", import.meta.url),
	`${JSON.stringify(entry)}\n`
);
