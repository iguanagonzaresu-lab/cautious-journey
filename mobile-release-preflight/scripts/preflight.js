#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {finding,gap,localJson} from './common.js';
import {inspectGit} from './git-diff.js';
import {androidConfig,checkAndroid} from './android-check.js';
import {iosConfig,checkIos} from './ios-check.js';
import {changeChecks,sourceChecks} from './changes.js';
import {testEvidence,previousRelease} from './evidence.js';
import {runTests} from './test-runner.js';
import {finalize,markdown} from './report.js';

export function parseArgs(args) {
  const o={repo:process.cwd(),platform:'auto',target:'unknown',maxAgeHours:24,timeout:120000,json:false,runTests:false};
  const values={'--repo':'repo','--base':'base','--platform':'platform','--target':'target','--evidence':'evidence',
    '--previous-release':'previousRelease','--max-age-hours':'maxAgeHours','--test-timeout-ms':'timeout'};
  const seen=new Set();
  for(let i=0;i<args.length;i++) {
    const a=args[i];if(seen.has(a)) throw new Error('duplicate-option');seen.add(a);
    if(a==='--json')o.json=true;else if(a==='--run-tests')o.runTests=true;else if(a==='--help')o.help=true;
    else if(values[a]&&args[i+1]&&!args[i+1].startsWith('--'))o[values[a]]=args[++i];else throw new Error('invalid-option');
  }
  if(!['auto','ios','android','both'].includes(o.platform)||!['production','beta','internal','unknown'].includes(o.target))throw new Error('invalid-scope');
  for(const [key,min,max] of [['maxAgeHours',1,168],['timeout',100,600000]]) {
    o[key]=Number(o[key]);if(!Number.isFinite(o[key])||o[key]<min||o[key]>max)throw new Error('invalid-limit');
  }
  if(o.runTests&&o.evidence)throw new Error('choose-test-source');
  return o;
}
function parseProjectJson(scan,file,findings) {
  if(!scan.content.has(file))return null;
  try {const j=JSON.parse(scan.content.get(file));if(!j||Array.isArray(j)||typeof j!=='object')throw new Error();return j;}
  catch {findings.push(finding('json-invalid','BLOCK','Configuration JSON is malformed; parser details withheld.',
    'Invalid configuration may prevent release tooling from loading.', 'Correct the JSON without changing secrets.', 'Parse the file and re-run.',file));return null;}
}
export async function audit(options) {
  const root=fs.realpathSync(options.repo);
  if(!fs.statSync(root).isDirectory())throw new Error('repo-not-directory');
  const scan=inspectGit(root,options.base);const findings=[...scan.findings];
  const pkg=parseProjectJson(scan,'package.json',findings);
  const staticFile=scan.files.includes('app.config.json')?'app.config.json':'app.json';
  const raw=parseProjectJson(scan,staticFile,findings);
  const dynamic=scan.files.some(p=>/^app\.config\.(?:js|ts|mjs|cjs|mts|cts)$/.test(p));
  const isExpo=Boolean(raw?.expo||pkg?.dependencies?.expo||pkg?.devDependencies?.expo||dynamic);
  const expo={file:staticFile,value:isExpo?(raw?.expo??raw):null,dynamic};
  const eas=parseProjectJson(scan,'eas.json',findings);
  const remote=eas?.cli?.appVersionSource==='remote'||Boolean(eas?.build&&Object.values(eas.build).some(p=>p?.autoIncrement||p?.extends));
  const detected=[];
  if(isExpo||scan.files.some(p=>/(^|\/)(AndroidManifest\.xml|build\.gradle(?:\.kts)?)$/.test(p)))detected.push('android');
  if(isExpo||scan.files.some(p=>/Info\.plist$|\.pbxproj$|(^|\/)Podfile$/.test(p)))detected.push('ios');
  const platforms=options.platform==='auto'?detected:options.platform==='both'?['android','ios']:[options.platform];
  if(!platforms.length)findings.push(gap('project','No supported mobile project could be identified.'));
  if(options.target==='unknown')findings.push(gap('release-target','Release destination has not been specified.'));
  if(dynamic)findings.push(gap('dynamic-config','Executable Expo configuration detected; not run. Effective config may differ.'));
  if(remote)findings.push(gap('managed-build-version','Remote/auto-increment/inherited EAS version configuration requires final release-build evidence.'));
  const configs=platforms.map(p=>p==='android'?androidConfig(scan,expo,remote):iosConfig(scan,expo,remote));
  for(const c of configs)findings.push(...(c.platform==='android'?checkAndroid(c):checkIos(c)));
  const changes=changeChecks(scan,platforms);findings.push(...changes.findings,...sourceChecks(scan));
  findings.push(...previousRelease(options.previousRelease?localJson(options.previousRelease):null,configs));
  let test;
  if(options.runTests) {
    test=await runTests(root,pkg,options.timeout);
    const after=inspectGit(root,options.base);
    if(after.fingerprint!==scan.fingerprint||after.head!==scan.head) {
      findings.push(gap('candidate-changed','Inspected source changed during tests; re-scan the final candidate.'));
      if(test.status==='PASS')test={...gap('tests','Test succeeded but source snapshot changed; success not bound to the final candidate.'),exitCode:0,durationMs:test.durationMs};
    }
  } else test=testEvidence(options.evidence?localJson(options.evidence):null,scan,{...options,platforms});
  findings.push(test);
  return finalize({version:'0.1.0',scope:{head:scan.head,base:scan.base,dirty:scan.dirty,appPath:scan.appPath,
    platforms,target:options.target,comparison:'base-to-working-tree plus untracked non-ignored files',
    scannedTextFiles:scan.content.size,sourceFingerprint:scan.fingerprint},
    changedPaths:scan.changes,changedRiskAreas:changes.areas,findings,
    limitations:['No build, signing, deployment, binary upload or store submission performed.',
      'Merged manifests, plugin-added permissions, runtime UI, CI authentication, artifacts and current store policies are not verified.',
      'Gradle/Xcode variants, generated values and dynamic Expo config need independent resolved release evidence.',
      'Secret patterns cover bounded source text only; no claim of complete secret absence.',
      'Permission additions and test-path relationships are heuristics; they do not prove a regression.']});
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct) {
  try {
    const options=parseArgs(process.argv.slice(2));
    if(options.help) console.log('Usage: node preflight.js --repo PATH [--platform auto|android|ios|both] [--target production|beta|internal] [--base REF] [--previous-release JSON] [--evidence JSON | --run-tests] [--json]\nExit: 0 PASS, 1 WARN (review required), 2 BLOCK, 64 invalid input. No build or publishing.');
    else {const report=await audit(options);console.log(options.json?JSON.stringify(report,null,2):markdown(report));process.exitCode=report.exitCode;}
  } catch {
    console.log(JSON.stringify({status:'ERROR',exitCode:64,message:'Unable to inspect this scope. Check arguments, local Git ref, file access and input JSON; details withheld to protect secrets.'}));
    process.exitCode=64;
  }
}
