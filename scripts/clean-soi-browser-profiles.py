"""Remove only disposable Chrome profiles created by soi-browser-smoke.mjs."""
import json
import shutil
import tempfile
from pathlib import Path

root=Path(tempfile.gettempdir()).resolve()
results=[]
for candidate in root.glob('backstage-soi-ui-*'):
    target=candidate.resolve()
    if candidate.is_symlink() or target.parent!=root or not target.name.startswith('backstage-soi-ui-') or not (target/'DevToolsActivePort').is_file():
        continue
    try:
        shutil.rmtree(target)
        results.append({'profile':target.name,'removed':True})
    except OSError:
        results.append({'profile':target.name,'removed':False,'reason':'in_use_or_access_denied'})
print(json.dumps({'temporary_root':str(root),'results':results}))
