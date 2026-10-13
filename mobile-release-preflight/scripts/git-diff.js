import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {gap, inside, LIMITS, safePath, textFile, hash} from './common.js';

export function git(root, args) {
  const env={...process.env, GIT_OPTIONAL_LOCKS:'0', GIT_TERMINAL_PROMPT:'0'};
  // Do not let ambient Git overrides silently select a different repository.
  for (const key of Object.keys(env)) if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG)/.test(key)) delete env[key];
  const result=spawnSync('git',['--no-pager','-c','core.fsmonitor=false','-C',root,...args],
    {encoding:'utf8',timeout:15000,maxBuffer:32*1024*1024,windowsHide:true,env});
  return result.status===0&&!result.error ? result.stdout : null;
}
const excluded= /(^|\/)(\.git|node_modules|Pods|\.gradle|\.expo|build|dist|coverage|\.venv|vendor)(\/|$)/;
export function eligible(file) {return !excluded.test(file) && !/\.(jks|keystore|p12|pfx|mobileprovision|png|jpg|jpeg|gif|webp|ico|mp4|zip|aab|apk|ipa|pdf|ttf|woff2?)$/i.test(file);}
function walk(root) {
  const files=[],pending=[''];
  while (pending.length) {
    const dir=pending.pop();
    for (const item of fs.readdirSync(path.join(root,dir),{withFileTypes:true})) {
      const p=(dir?dir+'/':'')+item.name;
      if (!eligible(p)) continue;
      if (item.isDirectory()) pending.push(p); else files.push(p);
      if (files.length+pending.length>LIMITS.files) throw new Error('file-limit');
    }
  }
  return files;
}
export function inspectGit(root, baseRef) {
  const findings=[];
  const top=git(root,['rev-parse','--show-toplevel'])?.trim();
  if (top && !inside(fs.realpathSync(top),root)) throw new Error('repository-root');
  const prefix=top?path.relative(fs.realpathSync(top),root).split(path.sep).join('/'):'';
  const head=git(root,['rev-parse','--verify','HEAD^{commit}'])?.trim()??null;
  let base=null;
  if (baseRef) {
    if (baseRef.startsWith('-')||! /^[\w./~^{}-]+$/.test(baseRef)) throw new Error('invalid-base');
    base=git(root,['rev-parse','--verify','--end-of-options',baseRef+'^{commit}'])?.trim();
    if (!base) throw new Error('invalid-base');
  } else base=head;
  if (!head) findings.push(gap('git-baseline','No usable HEAD commit; change history is unverified.'));
  let files=top?git(root,['ls-files','--cached','--others','--exclude-standard','-z','--','.']):null;
  if (files===null) files=walk(root); else files=[...new Set(files.split('\0').filter(Boolean))];
  files=files.filter(eligible).sort();
  if (files.length>LIMITS.files) throw new Error('file-limit');
  const status=top?git(root,['status','--porcelain=v1','-z','--untracked-files=all','--','.']):null;
  const dirty=status===null?null:Boolean(status.length);
  const names=base?git(root,['diff','--no-ext-diff','--no-textconv','--no-renames','--name-only','-z',base,'--','.']):null;
  const untracked=top?git(root,['ls-files','--others','--exclude-standard','-z','--','.']):null;
  // diff --name-only is repository-relative even when called in a subdirectory.
  const rel=n=>prefix&&n.startsWith(prefix+'/')?n.slice(prefix.length+1):n;
  const changes=names===null?files:[...new Set([...names.split('\0').filter(Boolean).map(rel),...(untracked??'').split('\0').filter(Boolean)])].sort();
  if (base && names===null) findings.push(gap('git-diff','Git could not provide the selected comparison.'));
  const content=new Map(); let bytes=0;
  for(const file of files) {
    try {
      const text=textFile(root,file);
      if(text===null) continue;
      bytes+=Buffer.byteLength(text);
      if(bytes>LIMITS.total) {findings.push(gap('scan-limit','Text scan limit reached; remaining files not inspected.'));break;}
      content.set(file,text);
    } catch {findings.push(gap('unreadable-file','File is oversized, binary, unreadable or a symlink; not inspected.',file));}
  }
  const prior=file=>{
    if(!base) return null;
    safePath(root,file);
    const p=(prefix?prefix+'/':'')+file;
    const mode=git(top??root,['ls-tree',base,'--',p]);
    if (!mode || !mode.startsWith('100')) return null;
    const size=git(root,['cat-file','-s',base+':'+p]);
    if (size===null||Number(size)>LIMITS.bytes) return null;
    return git(root,['show','--no-ext-diff','--no-textconv',base+':'+p]);
  };
  const fingerprint=hash([...content].map(([p,t])=>p+'\0'+hash(t)).join('\0'));
  return {head,base,dirty,appPath:prefix||'.',files,changes,content,prior,findings,fingerprint};
}
