import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {audit,parseArgs} from '../scripts/preflight.js';
import {inspectGit} from '../scripts/git-diff.js';
import {testEvidence,previousRelease} from '../scripts/evidence.js';
import {permissions} from '../scripts/changes.js';
import {checkAndroid} from '../scripts/android-check.js';
import {checkIos,plistValues} from '../scripts/ios-check.js';
import {runTests} from '../scripts/test-runner.js';
import {safePath,literal,compareVersions} from '../scripts/common.js';
import {markdown} from '../scripts/report.js';

const cli=fileURLToPath(new URL('../scripts/preflight.js',import.meta.url));
const defaultExpo=()=>({expo:{name:'Fixture',version:'1.2.0',android:{package:'org.example.fixture',versionCode:42},ios:{bundleIdentifier:'org.example.fixture',buildNumber:'42'}}});
const baseline=()=>({schemaVersion:1,confirmedReleased:true,platforms:{android:{id:'org.example.fixture',build:41},ios:{id:'org.example.fixture',version:'1.2.0',build:'41'}}});
function write(root,p,value) {const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,typeof value==='string'?value:JSON.stringify(value));}
function git(root,...args) {const r=spawnSync('git',['-C',root,...args],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
function fixture(t,{nested=false,noGit=false}={}) {
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mobile-preflight-test-'));
  t.after(()=>{assert.ok(path.basename(tmp).startsWith('mobile-preflight-test-'));fs.rmSync(tmp,{recursive:true,force:true});});
  const repo=path.join(tmp,'repo'),root=nested?path.join(repo,'apps/mobile'):repo;
  fs.mkdirSync(root,{recursive:true});
  write(root,'package.json',{name:'fixture',private:true,dependencies:{expo:'fixture-only'}});
  write(root,'app.json',defaultExpo());
  if(!noGit) {git(repo,'init','-q');git(repo,'add','.');commit(repo);}
  write(tmp,'previous.json',baseline());
  const f={tmp,repo,root,previousRelease:path.join(tmp,'previous.json')};
  f.options=(extra={})=>({...parseArgs([]),repo:root,target:'production',platform:'both',previousRelease:f.previousRelease,...extra});
  f.evidence=(overrides={})=>{const data={schemaVersion:1,generatedAt:new Date().toISOString(),commit:git(repo,'rev-parse','HEAD'),appPath:nested?'apps/mobile':'.',target:'production',platforms:['android','ios'],tests:{status:'passed'},...overrides};write(tmp,'evidence.json',data);return path.join(tmp,'evidence.json');};
  return f;
}
function commit(root){git(root,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','core.hooksPath=NUL','commit','-qm','fixture');}
function has(r,id,status){return r.findings.some(f=>f.id===id&&(!status||f.status===status));}

test('clean Expo + matching attestation + confirmed increment is scoped PASS',async t=>{
 const f=fixture(t);const r=await audit(f.options({evidence:f.evidence()}));
 assert.equal(r.status,'PASS');assert.equal(r.exitCode,0);assert.equal(r.productionReadiness,'NOT_VERIFIED');
 for(const x of r.findings)for(const k of ['evidence','risk','fix','verify'])assert.ok(x[k]);
 assert.match(markdown(r),/not approval to publish/);
});
test('missing test evidence never passes',async t=>{const f=fixture(t);const r=await audit(f.options());assert.equal(r.status,'WARN');assert.ok(has(r,'tests','WARN'));});
for(const build of [0,-1,1.5,true,'42',2100000001])test('invalid Android build '+JSON.stringify(build),()=>{
 assert.ok(checkAndroid({id:'org.demo.app',version:'1',build,findings:[]}).some(f=>f.id==='android-build'&&f.status==='BLOCK'));
});
test('Android upper bound accepted and missing unresolved',()=>{
 assert.ok(checkAndroid({id:'org.demo.app',version:'1',build:2100000000,findings:[]}).every(f=>f.status==='PASS'));
 assert.ok(checkAndroid({findings:[]}).every(f=>f.status==='WARN'));
});
test('iOS formats and numeric build comparison',()=>{
 assert.ok(checkIos({id:'org.demo.app',version:'1.2.3',build:'0',findings:[]}).every(f=>f.status==='PASS'));
 assert.ok(checkIos({id:'org.demo.app',version:'1.2',build:'abc',findings:[]}).filter(f=>f.status==='BLOCK').length===2);
 assert.equal(compareVersions('10.0','9.99'),1);assert.equal(compareVersions('1','1.0.0'),0);
});
test('unchanged and lower build identifiers block',()=>{
 for(const build of [40,41])assert.equal(previousRelease(baseline(),[{platform:'android',id:'org.example.fixture',build}])[0].status,'BLOCK');
 assert.equal(previousRelease(baseline(),[{platform:'ios',id:'org.example.fixture',version:'1.2.0',build:'41'}])[0].status,'BLOCK');
});
test('unconfirmed previous release and new iOS version train require review',()=>{
 assert.equal(previousRelease({...baseline(),confirmedReleased:false},[])[0].status,'WARN');
 assert.equal(previousRelease(baseline(),[{platform:'ios',id:'org.example.fixture',version:'2.0.0',build:'1'}])[0].status,'WARN');
});
test('app.config.json takes precedence over app.json',async t=>{
 const f=fixture(t),e=defaultExpo();e.expo.android.versionCode=0;write(f.root,'app.config.json',e);
 assert.ok(has(await audit(f.options()),'android-build','BLOCK'));
});
test('dynamic config is never executed and static values not trusted',async t=>{
 const f=fixture(t);write(f.root,'app.config.js',"require('node:fs').writeFileSync('SHOULD_NOT_EXIST','executed'); throw new Error('unsafe');");
 const r=await audit(f.options());assert.ok(has(r,'dynamic-config','WARN'));assert.ok(has(r,'android-id','WARN'));assert.equal(fs.existsSync(path.join(f.root,'SHOULD_NOT_EXIST')),false);
});
test('remote EAS ignores invalid local build number instead of false blocking',async t=>{
 const f=fixture(t),e=defaultExpo();e.expo.android.versionCode=-1;e.expo.ios.buildNumber='bad';write(f.root,'app.json',e);
 write(f.root,'eas.json',{cli:{appVersionSource:'remote'}});const r=await audit(f.options());
 assert.ok(has(r,'managed-build-version','WARN'));assert.ok(has(r,'android-build','WARN'));assert.ok(has(r,'ios-build','WARN'));assert.equal(r.status,'WARN');
});
test('malformed JSON blocks without leaking parser input',async t=>{
 const f=fixture(t);write(f.root,'app.json','{"private":"do-not-echo-marker", bad');const r=await audit(f.options());assert.ok(has(r,'json-invalid','BLOCK'));assert.doesNotMatch(JSON.stringify(r),/do-not-echo-marker/);
});
test('native Gradle literals override Expo; comments do not create duplicates',async t=>{
 const f=fixture(t);write(f.root,'android/app/build.gradle.kts','android {\n defaultConfig {\n applicationId = "org.example.fixture"\n versionName = "1.2.0"\n // versionCode = 0\n versionCode = 43\n }\n}\n');
 const r=await audit(f.options({platform:'android'}));assert.ok(has(r,'android-build','PASS'));
 assert.equal(literal('versionCode = providers.prop("v")','versionCode',true),undefined);
});
test('multiple native variants unresolved rather than false PASS',async t=>{
 const f=fixture(t);write(f.root,'android/app/build.gradle','productFlavors { paid {} }\nversionCode 42\napplicationId "org.example.fixture"\nversionName "1.2.0"');
 const r=await audit(f.options({platform:'android'}));assert.ok(has(r,'android-variant','WARN'));assert.ok(has(r,'android-build','WARN'));
});
test('native plist literal extraction and generated values',async t=>{
 const f=fixture(t);write(f.root,'ios/App/Info.plist','<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>org.example.fixture</string><key>CFBundleShortVersionString</key><string>1.2.0</string><key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string></dict></plist>');
 const r=await audit(f.options({platform:'ios'}));assert.ok(has(r,'ios-id','PASS'));assert.ok(has(r,'ios-build','WARN'));
 assert.equal(plistValues('<key>CFBundleVersion</key><string>42</string>'),null);
 assert.equal(plistValues('<!ENTITY external SYSTEM "file:///private"><plist><dict></dict></plist>'),null);
});
test('permission additions identified, existing permissions not reported',async t=>{
 const f=fixture(t),e=defaultExpo();e.expo.android.permissions=['android.permission.INTERNET'];write(f.root,'app.json',e);git(f.repo,'add','.');commit(f.repo);
 e.expo.android.permissions.push('android.permission.CAMERA');write(f.root,'app.json',e);const r=await audit(f.options());
 assert.equal(r.findings.filter(x=>x.id==='permission-added').length,1);assert.equal(r.status,'WARN');
});
test('permission diff works from nested monorepo application',async t=>{
 const f=fixture(t,{nested:true}),e=defaultExpo();e.expo.android.permissions=['android.permission.INTERNET'];write(f.root,'app.json',e);git(f.repo,'add','.');commit(f.repo);
 e.expo.android.permissions.push('android.permission.CAMERA');write(f.root,'app.json',e);git(f.repo,'add','.');
 const r=await audit(f.options());assert.equal(r.scope.appPath,'apps/mobile');assert.ok(r.changedPaths.includes('app.json'));assert.equal(r.findings.filter(x=>x.id==='permission-added').length,1);
});
test('Android comments and opposite-platform permission excluded',async t=>{
 assert.equal(permissions('AndroidManifest.xml','<!-- <uses-permission android:name="hidden"/> -->').size,0);
 const f=fixture(t),e=defaultExpo();e.expo.ios.infoPlist={NSCameraUsageDescription:'Purpose'};write(f.root,'app.json',e);
 assert.equal(has(await audit(f.options({platform:'android'})),'permission-added'),false);
});
test('untracked critical code is a risk, not proof of regression',async t=>{
 const f=fixture(t);write(f.root,'src/api/auth.js','export const example = true;');const r=await audit(f.options());
 assert.ok(r.changedPaths.includes('src/api/auth.js'));assert.ok(has(r,'regression-coverage','WARN'));assert.equal(r.status,'WARN');
});
test('explicit Git base detects committed changes',async t=>{
 const f=fixture(t);const base=git(f.repo,'rev-parse','HEAD');write(f.root,'src/payment.js','export const demo = true;');git(f.repo,'add','.');commit(f.repo);
 assert.ok((await audit(f.options({base}))).changedPaths.includes('src/payment.js'));
});
test('deleted files do not crash and invalid base rejects',async t=>{
 const f=fixture(t);fs.unlinkSync(path.join(f.root,'app.json'));assert.ok((await audit(f.options())).changedPaths.includes('app.json'));
 await assert.rejects(()=>audit(f.options({base:'not-a-real-ref'})));
});
for(const [name,overrides] of [['wrong commit',{commit:'0'.repeat(40)}],['wrong platform',{platforms:['ios']}],['wrong target',{target:'beta'}],['wrong app',{appPath:'other'}],['expired',{generatedAt:'2000-01-01T00:00:00Z'}],['future',{generatedAt:'2099-01-01T00:00:00Z'}],['skipped',{tests:{status:'skipped'}}]])test('evidence '+name+' cannot pass',async t=>{
 const f=fixture(t);const r=await audit(f.options({evidence:f.evidence(overrides)}));assert.equal(r.status,'WARN');
});
test('test failure attestation blocks',async t=>{const f=fixture(t);assert.equal((await audit(f.options({evidence:f.evidence({tests:{status:'failed'}})}))).status,'BLOCK');});
test('dirty working tree rejects previous clean commit evidence',async t=>{
 const f=fixture(t),evidence=f.evidence();write(f.root,'README.md','local modification');assert.ok(has(await audit(f.options({evidence})),'tests-evidence','WARN'));
});
test('no Git and unsupported folder never pass',async t=>{
 const f=fixture(t,{noGit:true});assert.ok(has(await audit(f.options()),'git-baseline','WARN'));
 fs.unlinkSync(path.join(f.root,'app.json'));write(f.root,'package.json',{});assert.ok(has(await audit(f.options({platform:'auto'})),'project','WARN'));
});
test('secret-shaped source blocks but value is never emitted',async t=>{
 const f=fixture(t);const secret=['ghp','_','A'.repeat(36)].join('');write(f.root,'src/settings.js',`const token = '${secret}';`);
 const r=await audit(f.options());assert.ok(has(r,'credential-pattern','BLOCK'));assert.equal(JSON.stringify(r).includes(secret),false);
});
test('generic client key reviewed rather than declared secret',async t=>{
 const f=fixture(t);write(f.root,'src/settings.js',"const apiKey = 'public-client-identifier';");assert.ok(has(await audit(f.options()),'credential-review','WARN'));
});
test('unresolved conflict blocks',async t=>{const f=fixture(t);write(f.root,'conflict.txt','<<<<<<< HEAD\none\n=======\ntwo\n>>>>>>> branch');assert.ok(has(await audit(f.options()),'merge-conflict','BLOCK'));});
test('large source and keystores never read as source',async t=>{
 const f=fixture(t);write(f.root,'large.txt','x'.repeat(1024*1024+1));write(f.root,'private.jks','do-not-read');const r=await audit(f.options());assert.ok(has(r,'unreadable-file','WARN'));assert.equal(r.findings.some(x=>x.file==='private.jks'),false);
});
test('path traversal and external directory junction rejected',async t=>{
 const f=fixture(t);assert.throws(()=>safePath(f.root,'../outside'));fs.mkdirSync(path.join(f.tmp,'outside'));write(f.tmp,'outside/app.json',defaultExpo());
 fs.symlinkSync(path.join(f.tmp,'outside'),path.join(f.root,'linked'),'junction');const s=inspectGit(f.root);assert.equal(s.content.has('linked/app.json'),false);
});
test('default scan executes neither tests nor lifecycle hooks',async t=>{
 const f=fixture(t);write(f.root,'package.json',{scripts:{test:'node check.cjs'}});write(f.root,'check.cjs',"require('node:fs').writeFileSync('marker','ran');");await audit(f.options());assert.equal(fs.existsSync(path.join(f.root,'marker')),false);
});
test('approved test runner passes, suppresses logs and skips pre/post hooks',async t=>{
 const f=fixture(t);const pkg={scripts:{pretest:'node hooks.cjs',test:'node check.cjs',posttest:'node hooks.cjs'}};
 write(f.root,'package.json',pkg);write(f.root,'check.cjs',"console.log('PRIVATE_TEST_OUTPUT');");write(f.root,'hooks.cjs',"require('node:fs').writeFileSync('hook-marker','ran');");
 const r=await runTests(f.root,pkg,15000);assert.equal(r.status,'PASS');assert.equal(JSON.stringify(r).includes('PRIVATE_TEST_OUTPUT'),false);assert.equal(fs.existsSync(path.join(f.root,'hook-marker')),false);
});
test('approved failing tests block',async t=>{
 const f=fixture(t),pkg={scripts:{test:'node check.cjs'}};write(f.root,'package.json',pkg);write(f.root,'check.cjs','process.exit(1);');assert.equal((await runTests(f.root,pkg,15000)).status,'BLOCK');
});
test('test timeout is unresolved, not success',async t=>{
 const f=fixture(t),pkg={scripts:{test:'node check.cjs'}};write(f.root,'package.json',pkg);write(f.root,'check.cjs','setInterval(()=>{},1000);');const r=await runTests(f.root,pkg,1500);assert.equal(r.status,'WARN');assert.match(r.evidence,/time limit/);
});
test('oversized test output stopped and withheld',async t=>{
 const f=fixture(t),pkg={scripts:{test:'node check.cjs'}};write(f.root,'package.json',pkg);write(f.root,'check.cjs',"process.stdout.write('x'.repeat(2*1024*1024));setInterval(()=>{},1000);");const r=await runTests(f.root,pkg,15000);assert.equal(r.status,'WARN');assert.match(r.evidence,/output limit/);
});
test('obvious build/deploy script refused',async t=>{const f=fixture(t);assert.equal((await runTests(f.root,{scripts:{test:'npm run deploy'}},1000)).status,'WARN');});
test('source mutation during approved test invalidates candidate success',async t=>{
 const f=fixture(t);write(f.root,'package.json',{dependencies:{expo:'fixture'},scripts:{test:'node check.cjs'}});write(f.root,'check.cjs',"require('node:fs').writeFileSync('mutated.txt','new source');");
 const r=await audit(f.options({runTests:true}));assert.ok(has(r,'candidate-changed','WARN'));assert.ok(has(r,'tests','WARN'));
});
test('CLI exit codes and argument errors',async t=>{
 const f=fixture(t),evidence=f.evidence();
 const run=args=>spawnSync(process.execPath,[cli,'--repo',f.root,...args],{encoding:'utf8',windowsHide:true});
 assert.equal(run(['--target','production','--previous-release',f.previousRelease,'--evidence',evidence,'--json']).status,0);
 assert.equal(run(['--json']).status,1);
 const e=defaultExpo();e.expo.android.versionCode=0;write(f.root,'app.json',e);assert.equal(run(['--json']).status,2);
 const invalid=run(['--bad-option','private-input-marker']);assert.equal(invalid.status,64);assert.doesNotMatch(invalid.stdout,/private-input-marker/);
 assert.equal(run(['--help']).status,0);assert.throws(()=>parseArgs(['--evidence','x','--run-tests']));
});
