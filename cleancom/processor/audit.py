"""Descriptive evidence only. Counts do not imply performance or efficiency."""
import hashlib
import json
import math
import re
from collections import Counter
from datetime import datetime
import numpy as np
import pandas as pd
import shapely
from pyproj import CRS, Transformer


def scalar(value):
    if value is None or pd.isna(value):
        return None
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def code(value):
    value = scalar(value)
    return str(value).strip().upper() if value is not None and str(value).strip() else None


def layer_id(index, name):
    return f"l{index:02d}-" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


class FieldAudit:
    def __init__(self, name, dtype, exact_unique=False, categorical=False):
        self.name, self.dtype = name, dtype
        self.exact_unique, self.categorical = exact_unique, categorical
        self.missing = self.nonfinite = self.rows = 0
        self.values, self.frequency, self.dates = set(), Counter(), Counter()
        self.distinct_complete = True
        self.minimum = self.maximum = None
        self.date_errors = 0

    def add(self, values):
        self.rows += len(values)
        series = pd.Series(values)
        missing = series.isna()
        if pd.api.types.is_object_dtype(series.dtype) or pd.api.types.is_string_dtype(series.dtype):
            missing |= series.map(lambda x: isinstance(x, str) and not x.strip())
        self.missing += int(missing.sum())
        good = series[~missing]
        if pd.api.types.is_numeric_dtype(series.dtype):
            finite = np.isfinite(good.to_numpy())
            self.nonfinite += int((~finite).sum())
            good = good.iloc[np.flatnonzero(finite)]
            if len(good):
                low, high = scalar(good.min()), scalar(good.max())
                self.minimum = low if self.minimum is None else min(self.minimum, low)
                self.maximum = high if self.maximum is None else max(self.maximum, high)
        strings = [str(scalar(v)).strip() for v in good]
        distinct = set(strings)
        if self.exact_unique or len(self.values | distinct) <= 2000:
            self.values.update(distinct)
        else:
            self.distinct_complete = False
            for item in distinct:
                if len(self.values) < 2001:
                    self.values.add(item)
        if self.categorical:
            self.frequency.update(strings)
        if self.dtype.startswith("datetime"):
            for value, count in Counter(strings).items():
                try:
                    day = datetime.fromisoformat(value.replace("Z", "+00:00")).date().isoformat()
                    self.dates[day] += count
                except ValueError:
                    self.date_errors += count

    def result(self):
        out = {"name": self.name, "dtype": self.dtype, "rows": self.rows,
               "missing": self.missing, "missingPercent": round(100 * self.missing / self.rows, 3) if self.rows else None,
               "nonFinite": self.nonfinite, "distinct": len(self.values), "distinctExact": self.distinct_complete,
               "minimum": self.minimum, "maximum": self.maximum, "unit": None}
        if self.categorical:
            out["topValues"] = [{"value": v, "count": c} for v, c in self.frequency.most_common(12)]
        if self.dtype.startswith("datetime"):
            years = Counter()
            for day, count in self.dates.items():
                years[day[:4]] += count
            out["period"] = {"start": min(self.dates) if self.dates else None,
                             "end": max(self.dates) if self.dates else None,
                             "yearCounts": dict(sorted(years.items())), "invalid": self.date_errors,
                             "granularity": "date" if self.dtype.endswith("[D]") else "datetime",
                             "timezone": None}
        return out


class LayerAudit:
    def __init__(self, reader, name, index, spec, preview_limit):
        self.reader, self.name, self.spec = reader, name, spec
        self.info = reader.info(name)
        self.id = layer_id(index, name)
        self.total = int(self.info["features"])
        self.fields = [FieldAudit(str(n), str(t), str(n) in spec.get("uniqueFields", []), str(n) in spec.get("categoricalFields", []))
                       for n, t in zip(self.info["fields"], self.info["dtypes"])]
        self.preview_limit = preview_limit
        self.stride = max(1, math.ceil(self.total / preview_limit))
        self.preview, self.geo_signatures = [], set()
        self.rows = self.empty = self.invalid = self.null = self.range_errors = self.transform_errors = 0
        self.types = Counter()
        self.bounds = None
        self.crs = CRS.from_user_input(self.info["crs"]) if self.info["crs"] else None
        self.transformer = Transformer.from_crs(self.crs, "EPSG:4326", always_xy=True) if self.crs else None
        self.months, self.ticket_routes, self.vehicle_values = Counter(), Counter(), set()
        self.duplicate_rows, self.row_signatures = 0, set()
        self.ticket_route_dates = Counter()
        self.valid_route_codes = set()

    def add(self, offset, chunk):
        meta, fids, wkbs, arrays = chunk
        count = len(fids)
        self.rows += count
        for field, values in zip(self.fields, arrays):
            field.add(values)
        columns = {str(name): values for name, values in zip(meta["fields"], arrays)}
        if self.name == self.spec["layers"]["tickets"]:
            for i in range(count):
                values = {name: scalar(col[i]) for name, col in columns.items()}
                signature = hashlib.sha256(json.dumps(values, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).digest()
                if signature in self.row_signatures:
                    self.duplicate_rows += 1
                self.row_signatures.add(signature)
                date_value = values.get(self.spec["fields"]["ticketDate"])
                try:
                    day = datetime.fromisoformat(str(date_value)).date()
                except ValueError:
                    continue
                if day.year != self.spec["declaredYear"]:
                    continue
                self.months[day.strftime("%Y-%m")] += 1
                route = code(values.get(self.spec["fields"]["ticketRoute"]))
                if route:
                    self.ticket_routes[route] += 1
                    self.ticket_route_dates[(route, day.isoformat())] += 1
                vehicle = code(values.get(self.spec["fields"]["vehicleId"]))
                if vehicle:
                    self.vehicle_values.add(vehicle)
        if wkbs is None:
            return
        geometries = shapely.from_wkb(wkbs, on_invalid="ignore")
        missing = shapely.is_missing(geometries)
        empty = shapely.is_empty(geometries)
        valid = shapely.is_valid(geometries)
        self.null += int(missing.sum())
        self.empty += int(empty.sum())
        self.invalid += int((~valid & ~missing & ~empty).sum())
        for i, geometry in enumerate(geometries):
            if geometry is not None and not geometry.is_empty:
                self.types[geometry.geom_type] += 1
                self.geo_signatures.add(hashlib.sha256(wkbs[i]).digest())
        if not self.transformer:
            return
        projected = shapely.transform(geometries, self.transformer.transform, interleaved=False)
        boxes = shapely.bounds(projected)
        finite = np.isfinite(boxes).all(axis=1)
        in_range = finite & (boxes[:, 0] >= -180) & (boxes[:, 2] <= 180) & (boxes[:, 1] >= -90) & (boxes[:, 3] <= 90)
        self.transform_errors += int((~finite & ~missing & ~empty).sum())
        self.range_errors += int((finite & ~in_range).sum())
        good = valid & ~missing & ~empty & in_range
        route_field = self.spec["fields"]["routeCode"]
        if route_field in columns:
            self.valid_route_codes.update(code(columns[route_field][i]) for i in np.flatnonzero(good))
            self.valid_route_codes.discard(None)
        if good.any():
            bounds = [float(boxes[good, 0].min()), float(boxes[good, 1].min()), float(boxes[good, 2].max()), float(boxes[good, 3].max())]
            self.bounds = bounds if self.bounds is None else [min(self.bounds[0], bounds[0]), min(self.bounds[1], bounds[1]), max(self.bounds[2], bounds[2]), max(self.bounds[3], bounds[3])]
        for i in np.flatnonzero(good):
            if (offset + i) % self.stride or len(self.preview) >= self.preview_limit:
                continue
            # Coordinates only: no invented z values, auto-repair or analytical interpolation.
            geometry = json.loads(shapely.to_geojson(shapely.force_2d(projected[i])))
            properties = {field: scalar(columns[field][i]) for field in self.spec.get("previewFields", []) if field in columns}
            self.preview.append({"type": "Feature", "id": int(fids[i]), "bbox": boxes[i].tolist(), "geometry": geometry, "properties": properties})

    def result(self):
        hint = re.search(r"(?<!\d)(?:19|20)\d{2}(?!\d)", self.name)
        transformation = None if not self.transformer else {
            "target": "EPSG:4326", "description": self.transformer.description,
            "accuracyM": self.transformer.accuracy if self.transformer.accuracy >= 0 else None,
            "ballpark": "ballpark" in self.transformer.description.lower(),
            "sourcePositionAccuracyM": None}
        return {"id": self.id, "name": self.name, "recordCount": self.rows,
                "expectedRecordCount": self.total, "complete": self.rows == self.total,
                "geometryType": self.info["geometry_type"], "fields": [field.result() for field in self.fields],
                "crs": {"definition": self.info["crs"], "name": self.crs.name if self.crs else None,
                        "epsg": self.crs.to_epsg() if self.crs else None,
                        "unit": self.crs.axis_info[0].unit_name if self.crs and self.crs.axis_info else None,
                        "transformation": transformation},
                "geometryQuality": None if not self.info["geometry_type"] else {
                    "null": self.null, "empty": self.empty, "invalid": self.invalid,
                    "types": dict(self.types), "identicalWkbDuplicates": sum(self.types.values()) - len(self.geo_signatures),
                    "outOfWgs84Range": self.range_errors, "transformationFailures": self.transform_errors},
                "boundsWgs84": self.bounds,
                "validRouteCodeCount": len(self.valid_route_codes),
                "periodHint": {"year": int(hint[0]), "evidence": "layer_name_only", "verified": False} if hint else None,
                "preview": {"count": len(self.preview), "selection": "systematic_source_row", "stride": self.stride,
                            "limit": self.preview_limit, "complete": len(self.preview) == self.rows,
                            "statisticalSample": False, "geometrySimplified": False,
                            "excludedInvalidGeometries": self.invalid + self.null + self.empty},
                "identicalAttributeRows": self.duplicate_rows if self.name == self.spec["layers"]["tickets"] else None}


def operational_summary(audits, spec):
    names = {audit.name: audit for audit in audits}
    ticket = names.get(spec["layers"]["tickets"])
    routes = names.get(spec["layers"]["routes"])
    if not ticket or not routes:
        return {"status": "unavailable", "reason": "required_layers_missing"}
    route_codes = routes.valid_route_codes
    matched = sum(count for route, count in ticket.ticket_routes.items() if route in route_codes)
    year_rows = sum(ticket.months.values())
    unmatched = [{"code": route, "ticketRows": count} for route, count in ticket.ticket_routes.most_common() if route not in route_codes]
    return {"status": "available", "year": spec["declaredYear"], "sourceLayer": ticket.name,
            "ticketRowsInYear": year_rows, "allTicketRows": ticket.rows,
            "vehiclesWithTicketsInYear": len(ticket.vehicle_values), "distinctTicketRouteCodesInYear": len(ticket.ticket_routes),
            "routeGeometryCodes": len(route_codes - {None}),
            "matchedTicketRows": matched, "unmatchedTicketRows": sum(x["ticketRows"] for x in unmatched),
            "missingRouteRowsInYear": year_rows - sum(ticket.ticket_routes.values()),
            "routeJoinRule": "trim_and_uppercase_preserving_leading_zeros",
            "months": [{"month": f"{spec['declaredYear']}-{month:02d}", "ticketRows": ticket.months.get(f"{spec['declaredYear']}-{month:02d}", 0)} for month in range(1, 13)],
            "unmatchedCodes": unmatched,
            "topRoutes": [{"code": route, "ticketRows": count, "hasRouteGeometry": route in route_codes} for route, count in ticket.ticket_routes.most_common(20)],
            "duplicateAttributeRowsAllPeriods": ticket.duplicate_rows,
            "interpretation": "Registros observados, no viajes únicos, flota disponible ni eficiencia. Sin registros no significa sin actividad.",
            "valueField": {"name": spec["fields"]["value"], "unit": spec.get("verifiedUnits", {}).get(spec["fields"]["value"]),
                           "usableAsMass": False},
            "efficiency": {"status": "not_evaluable", "missing": ["Unidad y significado documentados de Valor", "Distancias efectivamente recorridas", "Horas de inicio y fin", "Capacidad y disponibilidad de vehículos", "Validación de vigencia de rutas y vínculos de tickets"]}}
