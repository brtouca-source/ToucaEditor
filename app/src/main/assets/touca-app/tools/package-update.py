"""Run from the extracted update folder: python app/tools/package-update.py [output.zip]."""
from pathlib import Path
import hashlib,json,sys,zipfile
root=Path(__file__).resolve().parents[2];app=root/'app'
files=sorted(p for p in app.rglob('*') if p.is_file() and '__pycache__' not in p.parts and '.pyc'!=p.suffix)
manifest=[dict(path=p.relative_to(app).as_posix(),sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in files]
(root/'manifest-sha256.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
if len(sys.argv)>1:
 out=Path(sys.argv[1]).resolve()
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for p in [root/'Atualizar.cmd',root/'Atualizar.ps1',root/'LEIA-ME.txt',root/'manifest-sha256.json',*files]:z.write(p,'ToucaEditor-v30.1/'+p.relative_to(root).as_posix())
 print(out)
print('Manifest:',len(files),'files')
