import {finding,gap,literal,cleanComments} from './common.js';

export function androidConfig(scan, expo, remote) {
  const native=['android/app/build.gradle.kts','android/app/build.gradle','app/build.gradle.kts','app/build.gradle'].filter(p=>scan.content.has(p));
  const findings=[];
  if (native.length>1) findings.push(gap('android-variant','Multiple app Gradle files; select and verify the release variant.'));
  const file=native[0]??expo.file;
  const text=scan.content.get(native[0])??'';
  const variants=/\b(productFlavors|applicationIdSuffix|versionNameSuffix)\b/.test(cleanComments(text));
  if(variants) findings.push(gap('android-variant','Variant-specific Gradle configuration needs resolved release values.',file));
  const config=native.length?{
    id:literal(text,'applicationId'),version:literal(text,'versionName'),build:remote?undefined:literal(text,'versionCode',true)
  }:{id:expo.value?.android?.package,version:expo.value?.version,build:remote?undefined:expo.value?.android?.versionCode};
  if(native.length>1||variants) {config.id=undefined;config.version=undefined;config.build=undefined;}
  if (expo.dynamic&&!native.length) {config.id=undefined;config.version=undefined;config.build=undefined;}
  return {platform:'android',...config,file,findings,remote};
}
export function checkAndroid(c) {
  const findings=[...c.findings];
  const checks=[['id',v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(v)],
    ['version',v=>typeof v==='string'&&v.trim().length>0],
    ['build',v=>Number.isInteger(v)&&v>0&&v<=2100000000]];
  for(const [key,valid] of checks) {
    if(c[key]===undefined||c[key]===null) findings.push(gap('android-'+key,
      key==='build'&&c.remote?'EAS manages the build number; local values are not authoritative.':'Release '+key+' could not be statically resolved.',c.file));
    else findings.push(finding('android-'+key,valid(c[key])?'PASS':'BLOCK',
      valid(c[key])?'Literal Android '+key+' satisfies the inspected format rule.':'Literal Android '+key+' violates the inspected format rule.',
      'Invalid release identifiers can prevent installation or submission.',
      'Confirm the effective production Gradle/Expo value.','Check the resolved release variant and re-run.',c.file));
  }
  return findings;
}
