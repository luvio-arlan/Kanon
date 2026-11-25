/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies are forbidden. Extract shared types into @kanon/core.",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "ui-must-not-import-core-ai-or-web",
      severity: "error",
      comment:
        "AGENTS.md §2: packages/ui is a pure Design System package and MUST NOT import from packages/core, packages/ai, or apps/web.",
      from: {
        path: "^packages/ui/src",
      },
      to: {
        path: "(^packages/(core|ai)|^apps/web|^@kanon/(core|ai|web))",
      },
    },
    {
      name: "core-must-not-import-ui-ai-or-web",
      severity: "error",
      comment:
        "AGENTS.md §2: packages/core is the pure domain/math single source of truth and MUST NOT import from packages/ui, packages/ai, or apps/web.",
      from: {
        path: "^packages/core/src",
      },
      to: {
        path: "(^packages/(ui|ai)|^apps/web|^@kanon/(ui|ai|web))",
      },
    },
    {
      name: "ai-must-not-import-ui-or-web",
      severity: "error",
      comment: "AGENTS.md §2: packages/ai MUST NOT import from packages/ui or apps/web.",
      from: {
        path: "^packages/ai/src",
      },
      to: {
        path: "(^packages/ui|^apps/web|^@kanon/(ui|web))",
      },
    },
    {
      name: "no-cross-feature-internal-imports",
      severity: "error",
      comment:
        "AGENTS.md §2: apps/web/src/features/<domainA> MUST NOT import internal files of features/<domainB>. Import only via features/<domainB>/index.ts or move shared code to @kanon/core or @kanon/ui.",
      from: {
        path: "^apps/web/src/features/([^/]+)/",
      },
      to: {
        path: "^apps/web/src/features/[^/]+/",
        pathNot: [
          "^apps/web/src/features/$1/",
          "^apps/web/src/features/[^/]+/(?:index|public-[a-z0-9-]+)\\.tsx?$",
        ],
      },
    },
    {
      name: "app-routes-must-use-feature-barrels",
      severity: "error",
      comment:
        "AGENTS.md §2: apps/web/src/app/ routes must stay thin and only import public feature entrypoints (index.ts or public-*.ts).",
      from: {
        path: "^apps/web/src/app/",
      },
      to: {
        path: "^apps/web/src/features/[^/]+/",
        pathNot: "^apps/web/src/features/[^/]+/(?:index|public-[a-z0-9-]+)\\.tsx?$",
      },
    },
    {
      name: "locked-ui-stack-no-unapproved-libs",
      severity: "error",
      comment:
        "AGENTS.md §4: Unapproved UI/icon/chart libraries are forbidden. Use @kanon/ui and @tabler/icons-react (stroke={1.5}).",
      from: {
        path: "^(apps|packages)/",
      },
      to: {
        path: "(^|/)(lucide-react|@heroicons|react-icons|@mui|antd|@chakra-ui|chart\\.js|echarts)(/|$)",
      },
    },
    {
      name: "web-must-consume-primitives-via-kanon-ui",
      severity: "error",
      comment:
        "AGENTS.md §4: apps/web MUST NOT import @heroui/react, @radix-ui, react-aria-components, cmdk, vaul, or recharts directly; consume the themed wrappers from @kanon/ui.",
      from: {
        path: "^apps/web/src",
      },
      to: {
        path: "(^|/)(@heroui|@radix-ui|react-aria-components|cmdk|vaul|recharts)(/|$)",
      },
    },
    {
      name: "no-db-imports-in-web-features",
      severity: "error",
      comment:
        "AGENTS.md §2: Client/feature/shared UI layers MUST NOT import @kanon/core/db directly. Access Postgres only from Server Components or apps/web/src/app/api/** route handlers.",
      from: {
        path: "^apps/web/src/(features|shared)/",
      },
      to: {
        path: "(^packages/core/src/db|^@kanon/core/db)",
      },
    },
    {
      name: "shared-must-not-import-features-or-app",
      severity: "error",
      comment:
        "AGENTS.md §2: apps/web/src/shared/ is a foundational client utility layer and MUST NOT depend on apps/web/src/features/ or apps/web/src/app/.",
      from: {
        path: "^apps/web/src/shared/",
      },
      to: {
        path: "^apps/web/src/(features|app)/",
      },
    },
  ],
  options: {
    exclude: {
      path: "(^|/)(\\.next|dist|coverage)/",
    },
    doNotFollow: {
      path: "node_modules",
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "apps/web/tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      mainFields: ["module", "main", "types", "typings"],
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
};
