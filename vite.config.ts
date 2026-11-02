// SQUEEK_DEPENDENCIES supports an external toolchain in restricted build environments.
// Ordinary installs use the local dependency tree and need no setting.
const externalDependencies = process.env.SQUEEK_DEPENDENCIES;
export default {
  base: "./",
  resolve: externalDependencies
    ? {
        alias: [
          "react",
          "react-dom",
          "wagmi",
          "viem",
          "@tanstack/react-query",
        ].map((name) => ({
          find: name,
          replacement: `${externalDependencies}/${name}`,
        })),
      }
    : undefined,
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      onwarn(
        warning: { code?: string },
        warn: (warning: { code?: string }) => void,
      ) {
        // React's client directives have no effect in a client-only static app.
        if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
      },
    },
  },
};
