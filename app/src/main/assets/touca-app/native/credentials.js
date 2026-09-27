'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
exports.register=(ipc,app,safeStorage)=>{
 const file=()=>path.join(app.getPath('userData'),'elevenlabs.secure');
 const available=()=>{if(!safeStorage?.isEncryptionAvailable()||safeStorage.getSelectedStorageBackend?.()==='basic_text')throw Error('Criptografia do sistema indisponível.');};
 ipc.handle('touca:credential-read',async()=>{let bytes;try{bytes=await fs.readFile(file());}catch(e){if(e.code==='ENOENT')return '';throw e;}available();return safeStorage.decryptString(bytes);});
 ipc.handle('touca:credential-write',async(_,value)=>{if(typeof value!=='string'||value.length>1024)throw Error('Chave inválida');if(!value){await fs.rm(file(),{force:true});return true;}available();await fs.mkdir(path.dirname(file()),{recursive:true});const temp=file()+'.tmp';await fs.writeFile(temp,safeStorage.encryptString(value),{mode:0o600});await fs.rename(temp,file());return true;});
};
