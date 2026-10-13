import {finding,gap} from './common.js';
import {plistValues} from './ios-check.js';

export function permissions(file,text) {
  const values=new Set();
  if(!text) return values;
  if(/AndroidManifest\.xml$/.test(file)) {
    const xml=text.replace(/<!--[\s\S]*?-->/g,'');
    for(const m of xml.matchAll(/<uses-permission(?:-sdk-\d+)?\b[^>]*\bandroid:name\s*=\s*['"]([^'"]+)['"]/g)) values.add(m[1]);
  } else if(/(?:^|\/)(app\.json|app\.config\.json)$/.test(file)) {
    try {
      const json=JSON.parse(text);const e=json.expo??json;
      for(const p of (Array.isArray(e.android?.permissions)?e.android.permissions:[])) if(typeof p==='string') values.add('android:'+p);
      for(const k of Object.keys(e.ios?.infoPlist??{})) if(/^NS.*UsageDescription$/.test(k)) values.add('ios:'+k);
    } catch { /* malformed JSON is separately reported */ }
  } else if(/Info\.plist$/.test(file)) {
    for(const k of Object.keys(plistValues(text)??{})) if(/^NS.*UsageDescription$/.test(k)) values.add(k);
  }
  return values;
}
export function changeChecks(scan,platforms) {
  const findings=[],areas=new Set();
  const patterns={authentication:/(auth|login|session)/i,network:/(api|network|http)/i,
    persistence:/(database|storage|migration|schema)/i,payments:/(payment|billing|purchase)/i,
    navigation:/(navigation|router|deeplink)/i,background:/(background|notification|push)/i,
    native:/(Podfile|\.gradle|\.pbxproj|package(?:-lock)?\.json|yarn\.lock|pnpm-lock)/,
    configuration:/(app\.config|app\.json|eas\.json|Info\.plist|AndroidManifest|\.xcprivacy|\.entitlements|\.github\/workflows)/};
  const testChanged=scan.changes.some(p=>/(^|\/)(__tests__|tests?|e2e)(\/|$)|\.(test|spec)\./i.test(p));
  for(const file of scan.changes) {
    if(/(^|\/)(__tests__|tests?|e2e)(\/|$)|\.(test|spec)\./i.test(file)) continue;
    for(const [area,re] of Object.entries(patterns)) if(re.test(file)) areas.add(area);
    if((!platforms.includes('android')&&/AndroidManifest\.xml$/.test(file))||(!platforms.includes('ios')&&/Info\.plist$/.test(file))) continue;
    if(!/(AndroidManifest\.xml|Info\.plist|app\.json|app\.config\.json)$/.test(file)) continue;
    const current=permissions(file,scan.content.get(file));
    let before;
    try {before=scan.prior(file);} catch {findings.push(gap('permissions-baseline','Permission baseline was not readable.',file));continue;}
    if(!scan.base) {findings.push(gap('permissions-baseline','No baseline; new permission status is unknown.',file));continue;}
    const old=permissions(file,before);
    for(const p of current) if(!old.has(p)&&(!p.startsWith('android:')||platforms.includes('android'))&&(!p.startsWith('ios:')||platforms.includes('ios')))
      findings.push(finding('permission-added','WARN','A permission or purpose key was added; inspect its name locally (untrusted value withheld).',
        'Consent flow, privacy disclosures and store declarations may need updates.',
        'Review the new capability and its purpose with the release owner.',
        'Inspect merged manifests/entitlements and exercise consent on a device.',file));
  }
  if(areas.size) findings.push(finding('changed-risk-areas','WARN','Changed paths touch: '+[...areas].sort().join(', ')+'.',
    'Path-based risk detection is heuristic, not proof of a defect.',
    'Review affected workflows and their focused regression coverage.',
    'Exercise the selected mobile release variant.'));
  if(areas.size&&!testChanged) findings.push(finding('regression-coverage','WARN','Risk-related paths changed; no test-file change detected.',
    'Existing tests may cover the change, but coverage has not been established.',
    'Map changed behavior to existing or new regression tests.','Run those tests and inspect the results.'));
  return {findings,areas:[...areas].sort()};
}
export function sourceChecks(scan) {
  const findings=[];
  const strong=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{50,}\b/,/\bsk_live_[A-Za-z0-9]{20,}\b/];
  const possible=/\b(?:api[_-]?key|client[_-]?secret|password|access[_-]?token)\s*[:=]\s*['"][^'"\r\n]{12,}['"]/i;
  for(const [file,text] of scan.content) {
    if (strong.some(r=>r.test(text))) findings.push(finding('credential-pattern','BLOCK','High-risk credential-shaped content detected; value redacted.',
      'Potential secret exposure in inspected source.',
      'Review locally. If real, remove from distributable source and arrange authorized rotation.',
      'Run an independent secret audit; never paste the value into the report.',file));
    else if(possible.test(text)) findings.push(finding('credential-review','WARN','A credential-like literal needs review; value redacted.',
      'May be a secret, a public client identifier or a fixture; validity is unknown.',
      'Determine whether this literal is intended to be public.','Verify with the owning service and release configuration.',file));
    if(/^(?:<{7} |={7}$|>{7} )/m.test(text)) findings.push(finding('merge-conflict','BLOCK','Conflict-marker-shaped lines found in inspected source.',
      'An unresolved merge may break the release.', 'Inspect and resolve or document intentional fixture content.', 'Re-run the scan after review.',file));
  }
  return findings;
}
