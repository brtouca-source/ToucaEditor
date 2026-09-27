"""Reassemble byte-identical offline models; never downloads model weights."""
from pathlib import Path
import base64, hashlib, json
root=Path(__file__).resolve().parents[1]
for item in json.loads((root/'build-assets/manifest.json').read_text()):
    target=root/item['path']
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()==item['sha256']:
        continue
    data=b''.join(base64.b64decode((root/p).read_bytes(),validate=True) for p in item['parts'])
    if hashlib.sha256(data).hexdigest()!=item['sha256']:
        raise RuntimeError('Offline model checksum mismatch: '+item['path'])
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(data)
print('Offline model hashes verified')
