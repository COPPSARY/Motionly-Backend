export function buildCompileRepairPrompt(diagnostics: string): string {
    return [
        '<compile_repair>',
        'The current source did not compile. Repair only the reported issue using a localized patch.',
        'Do not rewrite unrelated files or change the requested design.',
        '<compile_diagnostics>',
        diagnostics,
        '</compile_diagnostics>',
        '</compile_repair>',
    ].join('\n');
}
