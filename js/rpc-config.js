/* ============================================================
   Chain data source configuration.
   The hero animation reads this object to decide where live
   Ethereum data comes from. This file is the ONLY place that
   needs to change when the site moves to Artifact Systems'
   own RPC infrastructure.

   To stream from company hardware, set `primary`:

     primary: "https://rpc.artifact-systems.io",

   and, if the endpoint requires auth, add headers:

     headers: { "Authorization": "Bearer <token>" },

   The public fallbacks below stay as a safety net; remove them
   if the site should only ever speak to company infrastructure.
   ============================================================ */

window.ARTIFACT_RPC = {
  // Artifact Systems endpoint. null = use public fallbacks only.
  primary: null,

  // Extra request headers, e.g. auth for the primary endpoint.
  headers: {},

  // Public endpoints, tried in order whenever `primary` is unset
  // or fails. Rotation advances on any error.
  fallbacks: [
    "https://ethereum-rpc.publicnode.com",
    "https://eth.llamarpc.com",
    "https://cloudflare-eth.com",
    "https://1rpc.io/eth"
  ],

  // How often to ask for the latest block. 12s = mainnet cadence.
  pollMs: 12000
};
