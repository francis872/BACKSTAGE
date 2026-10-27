"""Offline worker CLI. The web API serves its versioned evidence, not GDAL jobs."""
import argparse
import gzip
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import pyogrio
import shapely
import pyproj
from processor import VERSION
from processor.reader import FileGdbReader, fingerprint
from processor.audit import LayerAudit, operational_summary


def write_json(path, value):
    data = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf8")
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_bytes(data)
    temporary.replace(path)
    return data


def process(source, output, spec, chunk_size=5000, preview_limit=1000):
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    reader = FileGdbReader(source)
    initial = fingerprint(reader.source)
    audits, layers = [], []
    for index, (name, geometry) in enumerate(reader.layers(), 1):
        audit = LayerAudit(reader, name, index, spec, preview_limit)
        print(json.dumps({"stage": "audit", "layer": name, "records": audit.total}), flush=True)
        for offset, chunk in reader.chunks(name, audit.total, chunk_size):
            audit.add(offset, chunk)
            if offset and offset % 100000 == 0:
                print(json.dumps({"stage": "scan", "layer": name, "processed": audit.rows}), flush=True)
        layer = audit.result()
        if geometry:
            data = json.dumps({"type": "FeatureCollection", "features": audit.preview}, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode()
            compressed = gzip.compress(data, mtime=0)
            digest = hashlib.sha256(compressed).hexdigest()
            target = output / f"{audit.id}-{digest[:12]}.geojson.gz"
            temporary = target.with_suffix(target.suffix + '.tmp')
            temporary.write_bytes(compressed)
            temporary.replace(target)
            layer["preview"].update({"file": target.name, "sha256": digest, "bytes": len(data), "compressedBytes": len(compressed)})
        audits.append(audit)
        layers.append(layer)
    if fingerprint(reader.source) != initial:
        raise RuntimeError("La fuente cambió durante el procesamiento. No se publicará esta auditoría.")
    report = {"schema": "clean-com/audit-v1", "engineVersion": VERSION, "case": spec,
              "source": {"name": reader.source.name, "format": "FileGDB", **initial},
              "createdAt": datetime.now(timezone.utc).isoformat(),
              "engine": {"pyogrio": pyogrio.__version__, "gdal": pyogrio.__gdal_version_string__, "shapely": shapely.__version__, "pyproj": pyproj.__version__},
              "complete": all(layer["complete"] for layer in layers), "layers": layers,
              "summary": operational_summary(audits, spec)}
    write_json(output / "audit.json", report)
    print(json.dumps({"stage": "complete", "layers": len(layers), "sourceSha256": initial["sha256"], "summary": {k: v for k, v in report["summary"].items() if k not in ["unmatchedCodes", "topRoutes", "months"]}}), flush=True)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Auditoría verificable de Clean Com; no modifica la geodatabase")
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--spec", required=True)
    parser.add_argument("--chunk-size", type=int, default=5000)
    parser.add_argument("--preview-limit", type=int, default=1000)
    args = parser.parse_args()
    if args.chunk_size < 1 or not 1 <= args.preview_limit <= 2000:
        parser.error("Tamaño de lectura y límite de vista inválidos")
    process(args.source, args.output, json.loads(Path(args.spec).read_text(encoding="utf8")), args.chunk_size, args.preview_limit)
