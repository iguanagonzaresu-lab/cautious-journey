export function finalize(report) {
  const counts={PASS:0,WARN:0,BLOCK:0};for(const f of report.findings) counts[f.status]++;
  const status=counts.BLOCK?'BLOCK':counts.WARN?'WARN':'PASS';
  return {...report,status,decision:{PASS:'PASS',WARN:'PASS WITH WARNINGS',BLOCK:'BLOCKED'}[status],counts,
    productionReadiness:'NOT_VERIFIED',
    recommendation:status==='BLOCK'?'NO-GO: resolve blockers before proceeding.':status==='WARN'?
      'HOLD FOR REVIEW: resolve evidence gaps; this is not a release approval.':'GO to subsequent build/signing/store checks only; not approval to publish.',
    exitCode:{PASS:0,WARN:1,BLOCK:2}[status]};
}
export function markdown(report) {
  const lines=['# Mobile Release Preflight','',`STATUS: ${report.status} (${report.decision})`,
    `Platform: ${report.scope.platforms.join(', ')||'unresolved'} | Target: ${report.scope.target}`,
    `Commit: ${report.scope.head??'unavailable'} | Base: ${report.scope.base??'unavailable'}`,
    `Application path: ${report.scope.appPath} | Dirty: ${report.scope.dirty}`,
    '',`Production readiness: ${report.productionReadiness}`,''];
  for(const [status,title] of [['BLOCK','Blockers'],['WARN','Warnings / evidence gaps'],['PASS','Passed checks']]) {
    lines.push('## '+title,'');
    const items=report.findings.filter(f=>f.status===status);
    if(!items.length) lines.push('None in the inspected scope.','');
    for(const f of items) lines.push(`### [${status}] ${f.id}${f.file?' — '+f.file:''}`,
      `Evidence: ${f.evidence}`,`Risk: ${f.risk}`,`Fix: ${f.fix}`,`Verify: ${f.verify}`,'');
  }
  lines.push('## Limitations','',...report.limitations.map(t=>'- '+t),'','## Recommendation','',report.recommendation,'');
  return lines.join('\n');
}
