import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import ts from "typescript";

const root = path.join(import.meta.dirname, "..");
function sourceFiles(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const target = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			return sourceFiles(target);
		}
		return /\.[cm]?[jt]sx?$/.test(entry.name) ? [target] : [];
	});
}
test("application and runtime have no Next or Vinext imports or dependencies", () => {
	for (const directory of ["src", "server"]) {
		for (const file of sourceFiles(path.join(root, directory))) {
			assert.doesNotMatch(
				readFileSync(file, "utf-8"),
				/(?:from\s*|import\s*\()['"](?:next(?:\/|['"])|vinext(?:\/|['"])|@vinext\/)/,
				file
			);
		}
	}
	const pkg = JSON.parse(
		readFileSync(path.join(root, "package.json"), "utf-8")
	);
	for (const dependency of Object.keys({
		...pkg.dependencies,
		...pkg.devDependencies,
	})) {
		assert.doesNotMatch(
			dependency,
			/^(?:next|vinext|@vinext\/.*|react-server-dom-webpack)$/
		);
	}
});
test("every existing HTTP endpoint is connected to a native Start server route", () => {
	const routes = sourceFiles(path.join(root, "src/routes")).map((file) =>
		readFileSync(file, "utf-8")
	);
	for (const file of sourceFiles(path.join(root, "src/app")).filter(
		(candidate) => candidate.endsWith("/route.ts")
	)) {
		const module = `@/app/${path.relative(path.join(root, "src/app"), file).replace(/\.ts$/, "")}`;
		assert.ok(
			routes.some((route) => route.includes(JSON.stringify(module))),
			`Unrouted endpoint: ${module}`
		);
		const route = routes.find((candidate) =>
			candidate.includes(JSON.stringify(module))
		);
		const parsed = ts.createSourceFile(
			file,
			readFileSync(file, "utf-8"),
			ts.ScriptTarget.Latest,
			true
		);
		for (const statement of parsed.statements) {
			const names = [];
			if (
				ts.isExportDeclaration(statement) &&
				statement.exportClause &&
				ts.isNamedExports(statement.exportClause)
			) {
				names.push(
					...statement.exportClause.elements.map((element) => element.name.text)
				);
			} else if (
				ts
					.getModifiers(statement)
					?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
			) {
				if (ts.isFunctionDeclaration(statement) && statement.name) {
					names.push(statement.name.text);
				}
				if (ts.isVariableStatement(statement)) {
					names.push(
						...statement.declarationList.declarations.map((declaration) =>
							declaration.name.getText(parsed)
						)
					);
				}
			}
			for (const method of names.filter((name) =>
				/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(name)
			)) {
				assert.ok(
					route.includes(`handler.${method}`),
					`Unrouted method ${method}: ${module}`
				);
			}
		}
	}
});

test("Cloudflare static caching follows Vite's emitted asset URLs", () => {
	const headers = readFileSync(path.join(root, "public/_headers"), "utf-8");
	assert.doesNotMatch(headers, /_next/);
	assert.match(
		headers,
		/^\/assets\/\*\n\s+Cache-Control: public,max-age=31536000,immutable/m
	);
	assert.match(headers, /^\/\*\n\s+X-Content-Type-Options: nosniff/m);
});
