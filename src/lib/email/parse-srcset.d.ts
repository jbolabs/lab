declare module "parse-srcset" {
	export default function parse(
		source: string
	): { url: string; w?: number; h?: number; d?: number }[];
}
