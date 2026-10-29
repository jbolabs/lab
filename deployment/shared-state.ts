import { AlchemyContext } from "alchemy/AlchemyContext";
import { Effect, Layer } from "effect";

/** App approval must never authorize changing the account-wide state backend. */
export const sharedStateContext = Layer.effect(
	AlchemyContext,
	// oxlint-disable-next-line unicorn/no-array-method-this-argument -- Effect.map takes a mapping function as its second argument, not an Array thisArg.
	Effect.map(AlchemyContext, (context) => ({
		...context,
		updateStateStore: false,
	}))
);
