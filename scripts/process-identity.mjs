// Several Node CLI dependencies derive temporary paths from os.userInfo().
// Some Windows Node 24 builds can fail that call during module initialization.
// Supplying the standard POSIX-shaped process method gives those CLIs a safe,
// process-scoped identifier without changing behavior on platforms that have it.
if (typeof process.geteuid !== 'function') {
  Object.defineProperty(process, 'geteuid', {
    configurable: true,
    value: () => process.pid,
  });
}
