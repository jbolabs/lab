import { useCallback, useState } from "react";
import type { SetStateAction } from "react";

/** Keep optimistic row changes until a new server value arrives. */
export function useMessageField<T>(serverValue: T) {
	const [field, setField] = useState({ serverValue, value: serverValue });
	if (!Object.is(field.serverValue, serverValue)) {
		setField({ serverValue, value: serverValue });
	}
	const value = Object.is(field.serverValue, serverValue)
		? field.value
		: serverValue;
	const setValue = useCallback(
		(update: SetStateAction<T>) => {
			setField((current) => {
				const previous = Object.is(current.serverValue, serverValue)
					? current.value
					: serverValue;
				return {
					serverValue,
					value:
						typeof update === "function"
							? (update as (value: T) => T)(previous)
							: update,
				};
			});
		},
		[serverValue]
	);
	return [value, setValue] as const;
}
