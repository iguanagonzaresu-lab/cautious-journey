import {gap,finding,compareVersions} from './common.js';

export function testEvidence(data, scan, options, now=Date.now()) {
  if(!data) return gap('tests','No executed tests or test evidence supplied.');
  const created=Date.parse(data.generatedAt);
  const age=now-created;
  const valid=data.schemaVersion===1 && scan.head && scan.dirty===false && data.commit===scan.head &&
    data.appPath===scan.appPath && data.target===options.target &&
    Array.isArray(data.platforms) && options.platforms.every(p=>data.platforms.includes(p)) &&
    Number.isFinite(age)&&age>=-300000&&age<=options.maxAgeHours*3600000 &&
    ['passed','failed','skipped'].includes(data.tests?.status);
  if(!valid) return gap('tests-evidence','Attestation does not match a clean commit, app, target, platforms or accepted age.');
  if(data.tests.status==='skipped') return gap('tests','Matching attestation reports skipped tests.');
  return finding('tests',data.tests.status==='passed'?'PASS':'BLOCK',
    'User-supplied, revision-matched attestation reports '+data.tests.status+' tests. Not independently authenticated CI.',
    'An attestation is only as trustworthy and complete as its producer.',
    'Check the referenced test run and its coverage independently.','Re-run the approved regression suite for this revision.');
}
export function previousRelease(data, configs) {
  if(!data) return [gap('previous-release','No confirmed previous store release supplied; increments not verified.')];
  if(data.schemaVersion!==1||data.confirmedReleased!==true||!data.platforms||typeof data.platforms!=='object')
    return [gap('previous-release','Previous-release input lacks the required schema and explicit released confirmation.')];
  const findings=[];
  for(const c of configs) {
    const old=data.platforms[c.platform];
    if(!old || typeof c.id!=='string' || old.id!==c.id) {
      findings.push(gap(c.platform+'-increment','Previous release does not identify this application.'));continue;
    }
    const valid=c.platform==='android'
      ? Number.isInteger(old.build)&&old.build>0&&old.build<=2100000000&&Number.isInteger(c.build)
      : compareVersions(c.build,old.build)!==null&&typeof old.version==='string'&&typeof c.version==='string';
    if(!valid) {findings.push(gap(c.platform+'-increment','Release build comparison is unresolved.'));continue;}
    if(c.platform==='ios'&&old.version!==c.version) {
      findings.push(gap('ios-increment','Marketing version changed; verify the new App Store version train instead of assuming global build monotonicity.'));continue;
    }
    const increased=c.platform==='android'?c.build>old.build:compareVersions(c.build,old.build)>0;
    findings.push(finding(c.platform+'-increment',increased?'PASS':'BLOCK',
      increased?'Build identifier increased relative to the confirmed release.':'Build identifier did not increase relative to the confirmed release.',
      'A reused or lower build identifier may prevent an update/submission.',
      'Confirm the store history and choose a valid next build identifier.',
      'Check the final artifact version against the store record.'));
  }
  return findings;
}
