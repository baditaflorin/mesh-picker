import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-picker",
  description: "Provably-fair random team-splitter, turn-order, and secret-santa pairing",
  accentHex: "#f0a830",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
