export function registerSchemesAsPrivileged(protocol) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'showflow-media',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false,
      },
    },
  ]);
}
