import { AlchemyContext } from "alchemy/AlchemyContext";
import { Effect, Layer } from "effect";

/** App approval must never authorize changing the account-wide state backend. */
export const sharedStateContext = Layer.effect(
 AlchemyContext,
 Effect.map(AlchemyContext, context => ({ ...context, updateStateStore: false })),
);
