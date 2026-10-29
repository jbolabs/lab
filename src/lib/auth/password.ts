import { hashSync, compareSync } from "bcryptjs";

export function hashPassword(password: string): string {
	return hashSync(password, 12);
}

export function verifyPassword(password: string, hash: string): boolean {
	return compareSync(password, hash);
}
