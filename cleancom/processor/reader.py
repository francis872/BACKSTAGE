"""The only adapter that knows FileGDB/GDAL. Never writes the source."""
import hashlib
from pathlib import Path
import pyogrio
from pyogrio import raw


def fingerprint(source):
    files = sorted(p for p in Path(source).rglob("*") if p.is_file() and not p.name.endswith(".lock"))
    aggregate = hashlib.sha256()
    total = 0
    for file in files:
        aggregate.update(file.relative_to(source).as_posix().encode("utf8"))
        size = file.stat().st_size
        aggregate.update(str(size).encode("ascii"))
        total += size
        with file.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                aggregate.update(block)
    return {"sha256": aggregate.hexdigest(), "bytes": total, "files": len(files)}


class FileGdbReader:
    def __init__(self, source):
        self.source = Path(source).resolve(strict=True)
        if not self.source.is_dir() or self.source.suffix.lower() != ".gdb":
            raise ValueError("Se requiere un directorio File Geodatabase .gdb")

    def layers(self):
        return pyogrio.list_layers(self.source)

    def info(self, layer):
        return pyogrio.read_info(self.source, layer=layer, force_feature_count=True, force_total_bounds=True)

    def chunks(self, layer, total, size=5000):
        for offset in range(0, total, size):
            yield offset, raw.read(self.source, layer=layer, skip_features=offset,
                                  max_features=size, return_fids=True, datetime_as_string=True)
