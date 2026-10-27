import unittest
import tempfile
from pathlib import Path
import numpy as np
from shapely.geometry import Point, LineString
from processor.audit import FieldAudit, LayerAudit, operational_summary
from processor.reader import fingerprint

SPEC = {"declaredYear": 2025, "layers": {"tickets": "tickets", "routes": "routes"},
        "fields": {"ticketDate": "date", "ticketRoute": "route", "routeCode": "code", "vehicleId": "vehicle", "value": "value"},
        "uniqueFields": ["code"], "previewFields": ["code"]}


class Reader:
    def __init__(self, fields, dtypes, geometry=None, count=3):
        self.metadata = {"features": count, "fields": fields, "dtypes": dtypes,
                         "crs": "EPSG:4326" if geometry else None, "geometry_type": geometry}

    def info(self, _):
        return self.metadata


class EvidenceTests(unittest.TestCase):
    def test_missing_blank_nonfinite_and_cardinality_are_distinct(self):
        field = FieldAudit("name", "object")
        field.add(np.array([None, "", "  ", "A", "A", "B"], dtype=object))
        self.assertEqual(field.result()["missing"], 3)
        self.assertEqual(field.result()["distinct"], 2)
        numeric = FieldAudit("measure", "float64")
        numeric.add(np.array([np.nan, np.inf, -1, 0, 2]))
        self.assertEqual(numeric.result()["missing"], 1)
        self.assertEqual(numeric.result()["nonFinite"], 1)
        self.assertEqual(numeric.result()["minimum"], -1)
        self.assertIsNone(numeric.result()["unit"])

    def test_ticket_year_filter_and_route_join_preserve_leading_zero(self):
        tickets = LayerAudit(Reader(["date", "route", "vehicle"], ["datetime64[D]", "object", "object"], count=4), "tickets", 1, SPEC, 10)
        tickets.add(0, ({"fields": ["date", "route", "vehicle"]}, np.arange(4), None,
                        [np.array(["2025-01-01", "2026-01-01", "2025-02-01", "2025-02-02"]),
                         np.array(["001", "001", "1", "empty"]), np.array(["v1", "v2", "v1", "v3"])]))
        routes = LayerAudit(Reader(["code"], ["object"], "LineString", 2), "routes", 2, SPEC, 10)
        routes.add(0, ({"fields": ["code"]}, np.arange(2), np.array([LineString([(0, 0), (1, 1)]).wkb, LineString().wkb], dtype=object), [np.array(["001", "empty"])]))
        summary = operational_summary([tickets, routes], SPEC)
        self.assertEqual(summary["ticketRowsInYear"], 3)
        self.assertEqual(summary["vehiclesWithTicketsInYear"], 2)
        self.assertEqual(summary["matchedTicketRows"], 1)
        self.assertEqual(summary["unmatchedTicketRows"], 2)
        self.assertEqual(summary["efficiency"]["status"], "not_evaluable")
        self.assertFalse(summary["valueField"]["usableAsMass"])

    def test_preview_excludes_empty_and_out_of_range_without_repair(self):
        layer = LayerAudit(Reader(["code"], ["object"], "Point"), "layer_2024", 1, SPEC, 10)
        layer.add(0, ({"fields": ["code"]}, np.arange(3), np.array([Point(0, 0).wkb, Point().wkb, Point(181, 1).wkb], dtype=object), [np.array(["a", "b", "c"])]))
        result = layer.result()
        self.assertEqual(len(layer.preview), 1)
        self.assertEqual(result["geometryQuality"]["empty"], 1)
        self.assertEqual(result["geometryQuality"]["outOfWgs84Range"], 1)
        self.assertFalse(result["periodHint"]["verified"])

    def test_fingerprint_detects_change_and_ignores_volatile_locks(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)
            (source / "a.gdbtable").write_bytes(b"source")
            initial = fingerprint(source)
            (source / "process.lock").write_bytes(b"lock")
            self.assertEqual(initial, fingerprint(source))
            (source / "a.gdbtable").write_bytes(b"changed")
            self.assertNotEqual(initial["sha256"], fingerprint(source)["sha256"])


if __name__ == "__main__":
    unittest.main()
