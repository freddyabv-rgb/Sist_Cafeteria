/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-module-internal-imports',
      severity: 'error',
      comment:
        'Un módulo no puede importar archivos internos de otro módulo directamente. Debe usar únicamente el index.ts del módulo o la carpeta api/.',
      from: {
        path: '^src/modules/([^/]+)/',
      },
      to: {
        path: '^src/modules/([^/]+)/',
        pathNot: [
          // Permitir importaciones dentro del mismo módulo
          '^src/modules/$1/',
          // Permitir importar únicamente desde el index.ts o la carpeta api/ del otro módulo
          '^src/modules/[^/]+/index\\.ts$',
          '^src/modules/[^/]+/api/',
        ],
      },
    },
    {
      name: 'modules-cannot-import-platform-internals',
      severity: 'warn',
      comment:
        'Los módulos deben usar las APIs públicas de platform a través de su index.ts.',
      from: {
        path: '^src/modules/',
      },
      to: {
        path: '^src/platform/[^/]+/(?!index\\.ts).*',
        pathNot: '^src/platform/[^/]+/index\\.ts$',
      },
    },
    {
      name: 'shared-kernel-must-be-independent',
      severity: 'error',
      comment:
        'shared-kernel es la base de todo el sistema y no puede depender de platform ni de modules.',
      from: {
        path: '^src/shared-kernel/',
      },
      to: {
        path: '^src/(modules|platform)/',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
  },
};
