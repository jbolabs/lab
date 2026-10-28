/** Operator-only CI bootstrap. Never run automatically from application CI. */
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import { Config, Effect, Layer } from "effect";
import { sharedStateContext } from "./shared-state.ts";
import { accountId, mailDomains } from "./config.ts";

const owner = "jbolabs";
const repository = "lab";
const generation = 1;
const accountPermissions: Cloudflare.ApiToken.PermissionGroupRef[] = [
 "Account Settings Read", "Account Settings Write", "Workers Scripts Write", "Workers R2 Storage Write", "D1 Write", "Queues Write", "Workers Observability Write", "Secrets Store Write", "Workers AI Read", "Images Write", "Email Sending Write", "Account API Tokens Write",
];
const zonePermissions: Cloudflare.ApiToken.PermissionGroupRef[] = ["Zone Read", "Zone Settings Write", "DNS Write", "Workers Routes Write", "Email Routing Rules Write"];

export default Alchemy.Stack("mailflare-ci", {
 providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
 state: Layer.unwrap(Alchemy.Stage.pipe(Effect.flatMap(stage => stage === "ci" ? Effect.succeed(Cloudflare.state().pipe(Layer.provide(sharedStateContext))) : Effect.die(new Error("CI bootstrap only supports --stage ci"))))),
}, Effect.gen(function* () {
 const environment = yield* yield* Cloudflare.CloudflareEnvironment;
 if (environment.accountId !== accountId) return yield* Effect.die(new Error("Wrong Cloudflare account for Mailflare CI"));
 const production = yield* GitHub.Environment("ProductionEnvironment", { owner, repository, name: "production", deploymentBranchPolicy: { customBranchPolicies: ["main"] } });
 const token = yield* Cloudflare.ApiToken.AccountApiToken(`ProductionDeployToken${generation}`, {
  accountId, name: `mailflare-production-deploy-g${generation}`, expiresOn: "2027-10-05T23:59:59Z",
  policies: [
   { effect: "allow", permissionGroups: accountPermissions, resources: { [`com.cloudflare.api.account.${accountId}`]: "*" } },
   { effect: "allow", permissionGroups: zonePermissions, resources: { [`com.cloudflare.api.account.${accountId}`]: Object.fromEntries(mailDomains.map(domain => [`com.cloudflare.api.account.zone.${domain.zoneId}`, "*"])) } },
  ],
 });
 yield* GitHub.Secret("ProductionCloudflareToken", { owner, repository, environment: production, name: "CLOUDFLARE_API_TOKEN", value: token.value });
 yield* GitHub.Variable("ProductionCloudflareAccount", { owner, repository, environment: production, name: "CLOUDFLARE_ACCOUNT_ID", value: accountId });
 // The initial bootstrap is inert. Enabling releases is a separately authorized operation.
 const enabled = yield* Config.Boolean("MAILFLARE_ENABLE_DEPLOYS").pipe(Config.withDefault(false));
 yield* GitHub.Variable("DeploysEnabled", { owner, repository, name: "DEPLOYS_ENABLED", value: String(enabled) });
 return { productionEnabled: enabled };
}));
