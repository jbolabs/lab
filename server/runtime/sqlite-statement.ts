import type Database from "better-sqlite3";

export type Row = Record<string, unknown>;

function meta(info?: Database.RunResult) {
	return {
		changed_db: (info?.changes ?? 0) > 0,
		changes: info?.changes ?? 0,
		duration: 0,
		last_row_id: Number(info?.lastInsertRowid ?? 0),
		rows_read: 0,
		rows_written: info?.changes ?? 0,
		size_after: 0,
	};
}

function normalizeParam(value: unknown): unknown {
	if (value instanceof Date) {
		return Math.floor(value.getTime() / 1000);
	}
	if (typeof value === "boolean") {
		return value ? 1 : 0;
	}
	if (value instanceof ArrayBuffer) {
		return Buffer.from(value);
	}
	if (ArrayBuffer.isView(value)) {
		return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
	}
	return value;
}

export class SqlitePreparedStatement {
	private readonly db: Database.Database & {
		__statements?: Map<string, Database.Statement>;
	};
	private readonly sql: string;
	private readonly params: unknown[];
	constructor(
		db: Database.Database & {
			__statements?: Map<string, Database.Statement>;
		},
		sql: string,
		params: unknown[] = []
	) {
		this.db = db;
		this.sql = sql;
		this.params = params;
	}

	bind(...values: unknown[]) {
		return new SqlitePreparedStatement(
			this.db,
			this.sql,
			values.map(normalizeParam)
		);
	}

	private statement() {
		this.db.__statements ??= new Map();
		const cache = this.db.__statements;
		let statement = cache.get(this.sql);
		if (!statement) {
			statement = this.db.prepare(this.sql);
			cache.set(this.sql, statement);
		}
		return statement;
	}

	private isRead(): boolean {
		return (
			/^\s*(?<capture1>select|with|pragma|explain)\b/iu.test(this.sql) ||
			/\breturning\b/iu.test(this.sql)
		);
	}

	first<T = Row>(column?: string): Promise<T | null> {
		try {
			const row = this.statement()
				.raw(false)
				.get(...this.params) as Row | undefined;
			if (!row) {
				return Promise.resolve(null);
			}
			return Promise.resolve((column ? row[column] : row) as T);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	run<T = Row>() {
		try {
			if (this.isRead()) {
				const results = this.statement()
					.raw(false)
					.all(...this.params) as T[];
				return Promise.resolve({
					meta: meta(),
					results,
					success: true as const,
				});
			}
			const info = this.statement().run(...this.params);
			return Promise.resolve({
				meta: meta(info),
				results: [] as T[],
				success: true as const,
			});
		} catch (error) {
			return Promise.reject(error);
		}
	}

	all<T = Row>() {
		try {
			return Promise.resolve(this.run<T>());
		} catch (error) {
			return Promise.reject(error);
		}
	}

	raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]> {
		try {
			if (!this.isRead()) {
				this.statement().run(...this.params);
				return Promise.resolve([]);
			}
			const statement = this.statement();
			const rows = statement.raw(true).all(...this.params) as T[];
			if (options?.columnNames) {
				const names = statement
					.columns()
					.map((column) => column.name) as unknown as T;
				return Promise.resolve([names, ...rows]);
			}
			return Promise.resolve(rows);
		} catch (error) {
			return Promise.reject(error);
		}
	}
}
