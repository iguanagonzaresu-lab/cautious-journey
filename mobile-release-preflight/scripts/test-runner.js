import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {finding,gap} from './common.js';

export async function runTests(root, pkg, timeout=120000) {
  if(typeof pkg?.scripts?.test!=='string') return gap('tests','No root npm test script is available.');
  const command=pkg.scripts.test;
  // Obvious destructive/deploy scripts are never appropriate for this command.
  if(/\b(publish|deploy|submit|release|prebuild|build|migrate|rm|rmdir|del|curl|wget)\b/i.test(command))
    return gap('tests','The test script includes an operation outside the permitted test scope; not executed.');
  const candidates=[path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(fs.realpathSync(process.execPath)),'../lib/node_modules/npm/bin/npm-cli.js')];
  const cli=candidates.find(p=>fs.existsSync(p));
  if(!cli) return gap('tests','npm CLI next to the trusted Node installation was not found.');
  const env={...process.env,CI:'true',npm_config_ignore_scripts:'true',npm_config_update_notifier:'false',npm_config_audit:'false',npm_config_fund:'false'};
  for (const key of Object.keys(env)) if (/^(NODE_OPTIONS|NODE_PATH|npm_config_node_options)$/i.test(key)) delete env[key];
  const start=Date.now();
  return await new Promise(resolve=>{
    let settled=false,timedOut=false,bytes=0,overflow=false;
    const child=spawn(process.execPath,[cli,'--ignore-scripts','run','test'],
      {cwd:root,env,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
    function stop() {
      if(!child.pid) return;
      if(process.platform==='win32') {
        const taskkill=path.join(process.env.SystemRoot??'C:\\Windows','System32','taskkill.exe');
        spawnSync(taskkill,['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:5000});
      } else {try {process.kill(-child.pid,'SIGKILL');} catch {child.kill('SIGKILL');}}
    }
    const timer=setTimeout(()=>{timedOut=true;stop();finish(null);},timeout);
    function finish(code,error=false) {
      if(settled) return;settled=true;clearTimeout(timer);
      let f;
      if(timedOut||overflow||error||code===null) f=gap('tests',timedOut?'Test time limit reached; result unverified.':overflow?'Test output limit reached; result unverified.':'Test runner could not complete; result unverified.');
      else f=finding('tests',code===0?'PASS':'BLOCK','Approved root npm test exited with code '+code+'. Raw output withheld.',
        code===0?'Passing this command does not establish complete regression coverage.':'Required test command failed; causality is not established.',
        'Review the local test runner and relevant regression coverage.','Repeat approved tests for this exact candidate.');
      resolve({...f,durationMs:Date.now()-start,exitCode:code});
    }
    for(const stream of [child.stdout,child.stderr]) stream.on('data',chunk=>{
      bytes+=chunk.length;if(bytes>1024*1024&&!overflow) {overflow=true;stop();finish(null);}
    });
    child.once('error',()=>finish(null,true));child.once('close',code=>finish(code));
  });
}
