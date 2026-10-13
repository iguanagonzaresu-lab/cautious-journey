import {finding,gap,versionTuple} from './common.js';

export function plistValues(text) {
  const result={};
  if(!text||text.startsWith('bplist')||/<!ENTITY/.test(text)) return null;
  const stripped=text.replace(/<!--[\s\S]*?-->/g,'');
  if(!/<plist\b[^>]*>\s*<dict>/.test(stripped)||!/<\/dict>\s*<\/plist>\s*$/.test(stripped)) return null;
  for (const m of stripped.matchAll(/<key>\s*([^<]+?)\s*<\/key>\s*<(string|integer)>([^<]*)<\/\2>/g)) {
    if(Object.hasOwn(result,m[1])) return null;
    result[m[1]]=m[3].trim();
  }
  return result;
}
export function iosConfig(scan,expo,remote) {
  const files=[...scan.content.keys()].filter(p=>/(^|\/)Info\.plist$/.test(p)&&!/(Tests?|Pods|Frameworks)\//i.test(p));
  const findings=[];
  const dynamicValue=v=>typeof v==='string'&&/\$\(|\$\{|&/.test(v)?undefined:v;
  let result={id:expo.value?.ios?.bundleIdentifier,version:expo.value?.version,build:remote?undefined:expo.value?.ios?.buildNumber};
  const file=files[0]??expo.file;
  if(files.length===1) {
    const plist=plistValues(scan.content.get(file));
    if(!plist) findings.push(gap('ios-plist','Plist could not be safely interpreted.',file));
    result={id:dynamicValue(plist?.CFBundleIdentifier),version:dynamicValue(plist?.CFBundleShortVersionString),build:remote?undefined:dynamicValue(plist?.CFBundleVersion)};
  } else if(files.length>1 || (expo.dynamic&&!files.length)) {
    result={};findings.push(gap('ios-target','Multiple native targets or executable Expo configuration require resolved release values.',file));
  } else if([...scan.content.keys()].some(p=>p.endsWith('.pbxproj'))) {
    result={};findings.push(gap('ios-build-settings','Native Xcode settings detected without a unique Info.plist; generated values not resolved.'));
  }
  return {platform:'ios',...result,file,findings,remote};
}
export function checkIos(c) {
  const findings=[...c.findings];
  const checks=[['id',v=>typeof v==='string'&&/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(v)],
    ['version',v=>typeof v==='string'&&/^\d+\.\d+\.\d+$/.test(v)],
    ['build',v=>versionTuple(v)!==null]];
  for(const [key,valid] of checks) {
    if(c[key]===undefined||c[key]===null) findings.push(gap('ios-'+key,
      key==='build'&&c.remote?'EAS manages the build number; local values are not authoritative.':'Release '+key+' could not be statically resolved.',c.file));
    else findings.push(finding('ios-'+key,valid(c[key])?'PASS':'BLOCK',
      valid(c[key])?'Literal iOS '+key+' satisfies the inspected format rule.':'Literal iOS '+key+' violates the inspected format rule.',
      'Invalid release identifiers can prevent store submission.',
      'Confirm the effective Xcode/Expo release value.','Check the resolved target and re-run.',c.file));
  }
  return findings;
}
