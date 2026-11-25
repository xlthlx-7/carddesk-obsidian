"""Package the standalone plugin and original fixtures using explicit inputs."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
version = json.loads((ROOT / 'manifest.json').read_text())['version']
out = ROOT / 'dist'
out.mkdir(exist_ok=True)
with ZipFile(out / f'carddesk-plugin-{version}.zip', 'w', ZIP_DEFLATED) as archive:
    for name in ('main.js', 'manifest.json', 'styles.css'):
        archive.write(out / 'carddesk' / name, f'carddesk/{name}')
fixtures = ROOT / 'fixtures' / 'vault'
with ZipFile(out / f'carddesk-example-vault-{version}.zip', 'w', ZIP_DEFLATED) as archive:
    for source in sorted(fixtures.rglob('*')):
        if source.is_file():
            archive.write(source, source.relative_to(fixtures).as_posix())
print(f'Packaged plugin and original examples: {version}')
