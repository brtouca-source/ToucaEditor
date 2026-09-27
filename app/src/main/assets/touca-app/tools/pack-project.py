#!/usr/bin/env python3
"""python pack-project.py folder/project.json output.touca (ZIP portable)."""
import json,sys,zipfile
from pathlib import Path
manifest=Path(sys.argv[1]).resolve(); root=manifest.parent
doc=json.loads(manifest.read_text(encoding='utf-8'))
if doc.get('format')!='touca-project' or doc.get('version')!=1: raise SystemExit('Esperado touca-project versão 1')
files={}
for asset in doc['assets']:
    name=asset['path']; src=(root/name).resolve()
    if not src.is_relative_to(root) or not src.is_file() or '\\' in name or ':' in name: raise SystemExit('Mídia inválida: '+name)
    files[name]=src
with zipfile.ZipFile(sys.argv[2],'w',compression=zipfile.ZIP_DEFLATED,compresslevel=3,allowZip64=False) as z:
    z.write(manifest,'project.json')
    for name,src in files.items(): z.write(src,name)
print('Pacote pronto:',sys.argv[2])
