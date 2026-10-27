"""Bounded, deterministic spatial analytics. JSON stdin/stdout; no network or files."""
import copy
import hashlib
import json
import math
import sys
import time
from collections import OrderedDict

import numpy as np
from scipy import sparse, stats, __version__ as scipy_version
from scipy.spatial import cKDTree
from scipy.sparse.csgraph import connected_components
from shapely import STRtree, get_coordinates, make_valid, transform as geometry_transform, __version__ as shapely_version
from shapely.geometry import shape, mapping, Point, box
from pyproj import CRS, Transformer, __version__ as pyproj_version
if __package__:
    from .temporal import rolling_periods, paired_change, descriptive_trends
else:
    from temporal import rolling_periods, paired_change, descriptive_trends

VERSION = "bsie-1.1.0"
RUNTIME = {"python":sys.version.split()[0],"numpy":np.__version__,"scipy":scipy_version,"shapely":shapely_version,"pyproj":pyproj_version}
MAX_N = 1000
WEIGHTS_CACHE = OrderedDict()


def transform(function, geometry):
    return geometry_transform(geometry, function, interleaved=False)


class AnalysisError(ValueError):
    pass


def integer(value, low, high, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not float(value).is_integer() or not low <= value <= high:
        raise AnalysisError(f"{name} debe ser entero entre {low} y {high}.")
    return int(value)


def number(value, name, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or positive and value <= 0:
        raise AnalysisError(f"{name} debe ser numérico finito" + (" y positivo." if positive else "."))
    return float(value)


def prepare(payload, require_values=False):
    data = payload.get("data")
    if not isinstance(data, dict) or data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
        raise AnalysisError("Se requiere data GeoJSON FeatureCollection.")
    features = data["features"]
    if not 2 <= len(features) <= MAX_N:
        raise AnalysisError(f"Se requieren 2–{MAX_N} observaciones.")
    source_crs = CRS.from_user_input(payload.get("source_crs", "EPSG:4326"))
    to_wgs = Transformer.from_crs(source_crs, 4326, always_xy=True).transform
    geographic, identifiers, values, repaired, errors, warnings = [], [], [], [], [], []
    variable = payload.get("variable")
    seen = set()
    fingerprints = set(); total_vertices=0
    for i, feature in enumerate(features):
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            errors.append({"row": i, "error": "Feature inválida"}); continue
        properties = feature.get("properties") or {}
        if not isinstance(properties, dict):
            errors.append({"row": i, "error": "properties debe ser objeto o null"}); continue
        fid = str(feature.get("id", properties.get("id", i)))
        if not fid or len(fid) > 120 or fid in seen:
            errors.append({"row": i, "error": "ID ausente, largo o duplicado"}); continue
        seen.add(fid)
        try:
            geom = shape(feature.get("geometry"))
            vertex_count=len(get_coordinates(geom));total_vertices+=vertex_count
            if vertex_count>10000 or total_vertices>50000:
                raise AnalysisError("Límite geométrico: 10.000 vértices por observación, 50.000 por análisis.")
            if geom.is_empty or not np.isfinite(get_coordinates(geom)).all():
                raise AnalysisError("Geometría vacía o coordenadas no finitas")
            if not geom.is_valid:
                if payload.get("repair_invalid") is not True:
                    raise AnalysisError("Geometría inválida; reparación no autorizada")
                geom = make_valid(geom)
                repaired.append({"id": fid, "action": "shapely.make_valid", "original_retained": True})
            if geom.geom_type not in ("Point", "Polygon", "MultiPolygon", "LineString", "MultiPoint", "MultiLineString"):
                raise AnalysisError("Tipo geométrico no admitido")
            geom = transform(to_wgs, geom)
            bounds = geom.bounds
            if not np.isfinite(bounds).all() or bounds[0] < -180 or bounds[2] > 180 or bounds[1] < -90 or bounds[3] > 90:
                raise AnalysisError("Coordenadas fuera de WGS84")
            if geom.wkb_hex in fingerprints:
                raise AnalysisError("Geometría duplicada entre observaciones distintas")
            fingerprints.add(geom.wkb_hex)
            val = properties.get(variable) if variable else None
            if require_values:
                val = number(val, f"Variable {variable!r} en {fid}")
            values.append(val); identifiers.append(fid); geographic.append(geom)
        except (ValueError, TypeError, AttributeError) as exc:
            errors.append({"row": i, "id": fid, "error": str(exc)})
    report = {"valid": not errors, "observations": len(features), "accepted": len(geographic), "errors": errors, "repairs": repaired, "source_crs": source_crs.to_string(), "variable": variable, "warnings": warnings}
    if errors:
        if payload.get("operation") == "validate":
            return {"report": report, "invalid": True}
        raise AnalysisError("Validación fallida: " + json.dumps(errors[:10], ensure_ascii=False))
    west, south = np.min([g.bounds[:2] for g in geographic], axis=0)
    east, north = np.max([g.bounds[2:] for g in geographic], axis=0)
    if payload.get("analysis_extent") is not None:
        extent=payload["analysis_extent"]
        if not isinstance(extent,list) or len(extent)!=4:
            raise AnalysisError("analysis_extent requiere bbox WGS84.")
        ew,es,ee,en=[number(value,"analysis_extent") for value in extent]
        if not (-180<=ew<=west<=east<=ee<=180 and -90<=es<=south<=north<=en<=90):
            raise AnalysisError("analysis_extent debe cubrir todas las observaciones.")
        west,south,east,north=ew,es,ee,en
    if east - west > 10 or north - south > 10 or abs((south + north) / 2) > 85:
        raise AnalysisError("El motor regional limita la extensión a 10° y latitud ±85°. Divide el territorio antes de calcular distancias.")
    metric = CRS.from_proj4(f"+proj=aeqd +lat_0={(south+north)/2} +lon_0={(west+east)/2} +datum=WGS84 +units=m +no_defs")
    project = Transformer.from_crs(4326, metric, always_xy=True).transform
    inverse = Transformer.from_crs(metric, 4326, always_xy=True).transform
    projected = [transform(project, g) for g in geographic]
    xy = np.array([[g.centroid.x, g.centroid.y] for g in projected])
    report.update({"metric_crs": metric.to_string(), "distance_unit": "metre", "geometry_types": sorted(set(g.geom_type for g in geographic)), "bbox_wgs84": [float(west), float(south), float(east), float(north)]})
    warnings.append("Distancias entre centroides en proyección azimutal equidistante regional; no equivalen a distancias viales ni distancias exactas entre todos los pares.")
    return {"report": report, "ids": identifiers, "geographic": geographic, "projected": projected, "xy": xy, "y": np.asarray(values, dtype=float) if require_values else values, "inverse": inverse}


def weights(prepared, config):
    n = len(prepared["ids"])
    if not isinstance(config, dict):
        raise AnalysisError("weights debe ser un objeto.")
    method = config.get("method", "knn")
    key = hashlib.sha256(json.dumps({"ids": prepared["ids"], "geometries": [g.wkb_hex for g in prepared["projected"]], "config": config}, sort_keys=True).encode()).hexdigest()
    if key in WEIGHTS_CACHE:
        WEIGHTS_CACHE.move_to_end(key)
        return WEIGHTS_CACHE[key]
    rows, cols, vals = [], [], []
    if method in ("queen", "rook"):
        # Topology is evaluated before projection; shared vertices must not move
        # off a differently segmented edge under a nonlinear projection.
        geometries = prepared["geographic"]
        if any(g.geom_type not in ("Polygon", "MultiPolygon") for g in geometries):
            raise AnalysisError("Queen y Rook requieren polígonos.")
        tree = STRtree(geometries)
        for i, geom in enumerate(geometries):
            for j in tree.query(geom, predicate="intersects"):
                j = int(j)
                if j <= i:
                    continue
                if geom.intersection(geometries[j]).area > 0:
                    raise AnalysisError("Los polígonos se superponen; revisa la unidad espacial.")
                boundary = geom.boundary.intersection(geometries[j].boundary)
                adjacent = not boundary.is_empty if method == "queen" else boundary.length > 0
                if adjacent:
                    rows.extend([i,j]); cols.extend([j,i]); vals.extend([1.0,1.0])
    elif method in ("knn", "distance_band", "inverse_distance"):
        xy = prepared["xy"]
        tree = cKDTree(xy)
        zero_pairs = tree.query_pairs(1e-9)
        zero_policy = config.get("zero_distance", "error")
        if zero_policy not in ("error", "exclude"):
            raise AnalysisError("zero_distance debe ser error o exclude.")
        if zero_pairs and zero_policy == "error":
            raise AnalysisError("Centroides coincidentes: no se define 1/d. Usa zero_distance=exclude explícitamente.")
        if method == "knn":
            k = integer(config.get("k", min(4,n-1)), 1, n-1, "k")
            distances, indices = tree.query(xy, k=n)
            for i in range(n):
                candidates = sorted([(float(d),int(j)) for d,j in zip(distances[i],indices[i]) if int(j)!=i and d > 1e-9])[:k]
                for d,j in candidates:
                    rows.append(i); cols.append(j); vals.append(1.0)
        else:
            threshold = number(config.get("distance_m"), "distance_m", True)
            power = number(config.get("power", 1), "power", True)
            if power > 8:
                raise AnalysisError("power máximo 8 por estabilidad numérica.")
            pairs = tree.query_pairs(threshold, output_type="ndarray")
            for i,j in pairs:
                distance = float(np.linalg.norm(xy[i]-xy[j]))
                if distance <= 1e-9:
                    continue
                weight = distance ** -power if method == "inverse_distance" else 1.0
                rows.extend([int(i),int(j)]); cols.extend([int(j),int(i)]); vals.extend([weight,weight])
    else:
        raise AnalysisError("Método de vecindad no admitido.")
    raw = sparse.csr_matrix((vals,(rows,cols)), shape=(n,n))
    if config.get("symmetry", "union") == "union":
        raw = raw.maximum(raw.T)
    elif config.get("symmetry") != "directed":
        raise AnalysisError("symmetry debe ser union o directed.")
    raw.setdiag(0); raw.eliminate_zeros()
    if raw.nnz > 200000 or not np.isfinite(raw.data).all():
        raise AnalysisError("Matriz demasiado densa o pesos numéricamente inestables.")
    transform_name = config.get("transform", "row")
    if transform_name not in ("row", "none"):
        raise AnalysisError("Transformación de pesos no admitida.")
    row_sums = np.asarray(raw.sum(axis=1)).ravel()
    w = sparse.diags(np.divide(1,row_sums,out=np.zeros(n),where=row_sums!=0)) @ raw if transform_name=="row" else raw.copy()
    count, components = connected_components(raw, directed=False)
    degrees = np.diff(raw.indptr)
    info = {"method": method, "parameters": config, "order": prepared["ids"], "transform": transform_name, "s0": float(w.sum()), "nonzero": int(w.nnz), "islands": [prepared["ids"][i] for i in np.where(degrees==0)[0]], "components": int(count), "component_labels": components.tolist(), "neighbor_counts": degrees.tolist(), "neighbors_min": int(degrees.min()), "neighbors_max": int(degrees.max()), "neighbors_mean": float(degrees.mean()), "cache_key": key, "storage": "CSR"}
    result = (w.tocsr(),raw,info)
    WEIGHTS_CACHE[key] = result
    while len(WEIGHTS_CACHE)>8:
        WEIGHTS_CACHE.popitem(last=False)
    return result


def inference(payload, n):
    permutations = integer(payload.get("permutations", 199), 19, 9999, "permutations")
    if n*permutations > 1000000:
        raise AnalysisError("Límite n×permutaciones: 1.000.000.")
    seed = integer(payload.get("seed", 0), 0, 2147483647, "seed")
    alpha = payload.get("alpha", .05)
    if alpha not in (.1,.05,.01):
        raise AnalysisError("alpha debe ser 0.1, 0.05 o 0.01.")
    alternative = payload.get("alternative", "two_sided")
    if alternative not in ("two_sided","greater","less"):
        raise AnalysisError("Alternativa no admitida.")
    return permutations,seed,alpha,alternative


def permutation_p(observed, simulations, center, alternative="two_sided"):
    if alternative=="greater":
        extreme = np.count_nonzero(simulations >= observed-1e-12, axis=0)
    elif alternative=="less":
        extreme = np.count_nonzero(simulations <= observed+1e-12, axis=0)
    else:
        extreme = np.count_nonzero(np.abs(simulations-center) >= np.abs(observed-center)-1e-12, axis=0)
    return (extreme+1)/(len(simulations)+1)


def adjusted_p(values, method):
    p = np.asarray(values, dtype=float)
    if method=="none":
        return p
    if method!="bh":
        raise AnalysisError("Corrección admitida: bh o none.")
    order=np.argsort(p); ranks=np.arange(1,len(p)+1)
    adjusted=np.minimum.accumulate((p[order]*len(p)/ranks)[::-1])[::-1]
    output=np.empty(len(p)); output[order]=np.minimum(1,adjusted)
    return output


def moran(y,w,payload):
    n=len(y); z=y-y.mean(); denominator=float(z@z); s0=float(w.sum())
    if n<4 or denominator<=0 or not math.isfinite(denominator) or s0<=0:
        raise AnalysisError("Moran requiere al menos 4 valores no constantes y conectividad positiva.")
    b,seed,alpha,alternative=inference(payload,n)
    observed=float(n/s0*(z@(w@z))/denominator)
    rng=np.random.default_rng(seed)
    simulations=np.empty(b)
    for i in range(b):
        permuted=rng.permutation(z); simulations[i]=n/s0*(permuted@(w@permuted))/denominator
    expected=-1/(n-1); variance=float(np.var(simulations,ddof=1))
    p=float(permutation_p(observed,simulations,expected,alternative))
    significant=p<=alpha
    direction="positive" if observed>0 else "negative"
    text=("Hay evidencia de autocorrelación espacial "+("positiva" if direction=="positive" else "negativa")+" bajo los pesos y el modelo nulo seleccionados.") if significant else "No hay evidencia suficiente para rechazar la ausencia de autocorrelación espacial bajo el modelo nulo seleccionado; esto no demuestra aleatoriedad."
    return {"statistic":observed,"expected":expected,"permutation_mean":float(simulations.mean()),"variance":variance,"variance_method":"Monte Carlo random-label permutations, ddof=1","z_score":float((observed-expected)/math.sqrt(variance)) if variance>0 else None,"p_value":p,"permutations":b,"seed":seed,"alpha":alpha,"alternative":alternative,"significant":significant,"direction":direction if significant else "insufficient_evidence","interpretation":text,"minimum_monte_carlo_p":1/(b+1)}


def local_statistics(prepared,w,raw,payload,hotspot=False):
    y=prepared["y"]; n=len(y); z=y-y.mean(); s2=float(z@z)
    if n<4 or s2<=0 or not math.isfinite(s2) or raw.nnz==0:
        raise AnalysisError("Estadística local requiere 4 valores no constantes y conectividad.")
    b,seed,alpha,alternative=inference(payload,n)
    rng=np.random.default_rng(seed); correction=payload.get("correction","bh")
    lag=w@z; results=[]; valid=[]; p_values=[]
    for i in range(n):
        if raw.indptr[i]==raw.indptr[i+1]:
            results.append({"id":prepared["ids"][i],"value":float(y[i]),"statistic":None,"p_value":None,"adjusted_p":None,"category":"ISLAND"}); continue
        if hotspot:
            row=raw.getrow(i).toarray().ravel();row[i]=1.0
            total=float(row.sum()); sd=math.sqrt(s2/n)
            denominator=sd*math.sqrt(max(0,(n*float(row@row)-total**2)/(n-1)))
            if denominator<=np.finfo(float).eps:
                results.append({"id":prepared["ids"][i],"value":float(y[i]),"statistic":None,"p_value":None,"adjusted_p":None,"category":"UNDEFINED_FULL_NEIGHBORHOOD"}); continue
            observed=float((row@y-y.mean()*total)/denominator)
            sims=np.array([(row@rng.permutation(y)-y.mean()*total)/denominator for _ in range(b)])
            center=0.0
        else:
            row=w.getrow(i); neighbors=row.indices; rowweights=row.data
            observed=float((n-1)*z[i]*lag[i]/s2)
            pool=np.delete(z,i)
            sims=np.array([(n-1)*z[i]*(rowweights@rng.permutation(pool)[:len(neighbors)])/s2 for _ in range(b)])
            center=float(-z[i]**2*rowweights.sum()/s2)
        p=float(permutation_p(observed,sims,center,alternative))
        valid.append(i);p_values.append(p)
        category=("HOTSPOT" if observed>0 else "COLDSPOT") if hotspot else ("HH" if z[i]>0 and lag[i]>0 else "LL" if z[i]<0 and lag[i]<0 else "HL" if z[i]>0 and lag[i]<0 else "LH" if z[i]<0 and lag[i]>0 else "UNDEFINED_ZERO_DEVIATION")
        results.append({"id":prepared["ids"][i],"value":float(y[i]),"statistic":observed,"p_value":p,"adjusted_p":None,"unfiltered_category":category,"category":"NOT_SIGNIFICANT","spatial_lag_centered":float(lag[i]),"null_expected":center})
    adjusted=adjusted_p(p_values,correction)
    for index,p in zip(valid,adjusted):
        results[index]["adjusted_p"]=float(p)
        if p<=alpha:
            results[index]["category"]=results[index]["unfiltered_category"]
    features=[{"type":"Feature","id":r["id"],"geometry":mapping(g),"properties":r} for g,r in zip(prepared["geographic"],results)]
    return {"observations":results,"geojson":None if payload.get("suppress_locations") else {"type":"FeatureCollection","features":features},"permutations":b,"seed":seed,"alpha":alpha,"alternative":alternative,"correction":correction,"inference":"unconditional random labeling Gi* with self-weight 1" if hotspot else "conditional randomization fixing focal value; empirical-tail test centered at conditional expectation","warning":"Las categorías dependen de los pesos, la escala y la corrección. Atípico espacial no equivale a extremo univariante ni implica causalidad."}


def kernel_values(u,kernel):
    if kernel=="gaussian":return np.exp(-.5*u*u)/(2*math.pi)
    if kernel=="quartic":return 3/math.pi*np.maximum(0,1-u*u)**2*(u<=1)
    if kernel=="epanechnikov":return 2/math.pi*np.maximum(0,1-u*u)*(u<=1)
    if kernel=="uniform":return (u<=1).astype(float)/math.pi
    if kernel=="triangular":return 3/math.pi*np.maximum(0,1-u)*(u<=1)
    raise AnalysisError("Kernel no admitido.")


def density(prepared,payload):
    if any(g.geom_type!="Point" for g in prepared["projected"]):raise AnalysisError("KDE requiere puntos; no convierte polígonos a eventos.")
    config=payload.get("density",{}); h=number(config.get("bandwidth_m"),"bandwidth_m",True)
    if not 1<=h<=100000:raise AnalysisError("bandwidth_m debe estar entre 1 y 100.000 metros.")
    kernel=config.get("kernel","gaussian");kernel_values(np.array([0.]),kernel)
    resolution=integer(config.get("resolution",32),4,64,"resolution")
    if len(prepared["ids"])*resolution**2>2000000:raise AnalysisError("KDE limita puntos×celdas a 2.000.000.")
    xy=prepared["xy"];bounds=config.get("extent_m")
    if bounds is None:bounds=[float(xy[:,0].min()-3*h),float(xy[:,1].min()-3*h),float(xy[:,0].max()+3*h),float(xy[:,1].max()+3*h)]
    if not isinstance(bounds,list) or len(bounds)!=4:raise AnalysisError("extent_m requiere cuatro límites en el CRS métrico reportado.")
    west,south,east,north=[number(v,"extent_m") for v in bounds]
    if west>=east or south>=north:raise AnalysisError("Extensión desordenada.")
    if max(abs(west),abs(south),abs(east),abs(north))>2000000:raise AnalysisError("La malla KDE debe permanecer dentro de 2.000 km del origen regional.")
    pointweights=np.asarray(config.get("observation_weights",[1.]*len(xy)),dtype=float)
    if pointweights.shape!=(len(xy),) or not np.isfinite(pointweights).all() or np.any(pointweights<0) or pointweights.sum()<=0:raise AnalysisError("Pesos KDE inválidos.")
    dx=(east-west)/resolution;dy=(north-south)/resolution
    mask=None
    if config.get("mask"):
        # Mask coordinates are WGS84, independently of any input source CRS.
        mask=shape(config["mask"])
        if mask.geom_type not in ("Polygon","MultiPolygon") or not mask.is_valid:raise AnalysisError("Máscara territorial inválida.")
    features=[];grid=[]
    for row in range(resolution):
        line=[]
        for col in range(resolution):
            x=west+(col+.5)*dx;y=south+(row+.5)*dy
            lng,lat=prepared["inverse"](x,y)
            value=None if mask is not None and not mask.covers(Point(lng,lat)) else float(kernel_values(np.linalg.norm(xy-[x,y],axis=1)/h,kernel)@pointweights/h**2)
            line.append(value)
            if value is not None:
                geom=transform(prepared["inverse"],box(west+col*dx,south+row*dy,west+(col+1)*dx,south+(row+1)*dy))
                features.append({"type":"Feature","id":f"{row}:{col}","geometry":mapping(geom),"properties":{"density_per_km2":value*1000000}})
        grid.append(line)
    finite=[v for row in grid for v in row if v is not None]
    if not finite:raise AnalysisError("La máscara excluye todas las celdas.")
    return {"grid":grid,"unit":"weighted observations per square metre","extent_m":bounds,"resolution":resolution,"cell_size_m":[dx,dy],"bandwidth_m":h,"kernel":kernel,"bandwidth_selection":"explicit_user_parameter","approximate_integral":float(sum(finite)*dx*dy),"total_observation_weight":float(pointweights.sum()),"statistics":{"minimum":min(finite),"maximum":max(finite),"mean":sum(finite)/len(finite)},"geojson":None if payload.get("suppress_locations") else {"type":"FeatureCollection","features":features},"warnings":["Densidad descriptiva observada; no es probabilidad de ocurrencia futura.","Hay sesgo de borde y dependencia del ancho de banda; no se aplica corrección de borde ni normalización de máscara."]}


def regression(prepared,w,payload):
    names=payload.get("predictors")
    if not isinstance(names,list) or not 1<=len(names)<=10 or any(not isinstance(name,str) or not name or len(name)>120 for name in names) or len(set(names))!=len(names):raise AnalysisError("Selecciona 1–10 predictores distintos.")
    features=payload["data"]["features"]
    x=np.asarray([[number(f.get("properties",{}).get(key),key) for key in names] for f in features]);x=np.column_stack([np.ones(len(x)),x]);y=prepared["y"]
    if len(y)<=x.shape[1]+2 or np.linalg.matrix_rank(x)<x.shape[1] or np.linalg.cond(x)>1e10:raise AnalysisError("Regresión insuficiente, colineal o numéricamente inestable.")
    beta,_,_,_=np.linalg.lstsq(x,y,rcond=None);residuals=y-x@beta;dof=len(y)-x.shape[1];sse=float(residuals@residuals);tss=float((y-y.mean())@(y-y.mean()))
    se=np.sqrt(np.maximum(0,np.diag(np.linalg.inv(x.T@x))*(sse/dof)));t=np.divide(beta,se,out=np.zeros_like(beta),where=se>0)
    residual_moran=None
    if sse>1e-12:residual_moran=moran(residuals,w,payload)
    baseline={"method":"OLS baseline","model":"ols","coefficients":[{"name":name,"coefficient":float(b),"standard_error":float(s),"p_value":float(2*stats.t.sf(abs(v),dof)) if s>0 else None} for name,b,s,v in zip(["intercept"]+names,beta,se,t)],"r_squared":1-sse/tss if tss>0 else None,"degrees_of_freedom":dof,"residual_moran":residual_moran,"warnings":["Asociación estadística, no causalidad. Inferencia OLS supone errores homocedásticos e independientes; diagnostica residuos."]}
    requested=payload.get("model","ols")
    if requested not in ("ols","diagnostics","auto","spatial_lag","spatial_error"):raise AnalysisError("Modelo admitido: ols, diagnostics, auto, spatial_lag o spatial_error.")
    if requested=="ols" and payload.get("diagnostics") is not True:return baseline
    return spatial_regression(prepared,w,payload,x,y,names,baseline,sse)


def spatial_regression(prepared,w,payload,x,y,names,baseline,sse):
    import contextlib
    import io
    import warnings
    try:
        import spreg
        from libpysal.weights import W
    except ImportError as exc:
        raise AnalysisError("Instala bsie/requirements.txt para regresión espacial.") from exc
    requested=payload.get("model","ols");alpha=payload.get("alpha",.05)
    if alpha not in (.1,.05,.01):raise AnalysisError("alpha debe ser 0.1, 0.05 o 0.01.")
    if sse<=np.finfo(float).eps*max(1,float((y-y.mean())@(y-y.mean()))):raise AnalysisError("Ajuste OLS perfecto: los diagnósticos espaciales no están definidos.")
    row_sums=np.asarray(w.sum(axis=1)).ravel()
    if not np.allclose(row_sums,1):raise AnalysisError("Regresión espacial exige pesos estandarizados por fila y sin islas.")
    neighbors={i:w.getrow(i).indices.tolist() for i in range(len(y))}
    values={i:w.getrow(i).data.tolist() for i in range(len(y))}
    reference=W(neighbors,values,id_order=list(range(len(y))),silence_warnings=True)
    with contextlib.redirect_stdout(io.StringIO()),warnings.catch_warnings(record=True) as captured:
        warnings.simplefilter("always")
        ols=spreg.OLS(y[:,None],x[:,1:],w=reference,nonspat_diag=False,spat_diag=False,name_x=names,name_y=payload["variable"])
        lm=spreg.LMtests(ols,reference,tests=['lme','lml','rlme','rlml','sarma'])
        diagnostics={}
        for key,name in (("lme","lm_error"),("lml","lm_lag"),("rlme","robust_lm_error"),("rlml","robust_lm_lag"),("sarma","lm_sarma")):
            statistic,pvalue=getattr(lm,key)
            if not math.isfinite(float(statistic)) or not math.isfinite(float(pvalue)):
                raise AnalysisError("Los diagnósticos LM no están definidos para este diseño y vecindad.")
            diagnostics[name]={"statistic":float(statistic),"p_value":float(pvalue),"significant":float(pvalue)<=alpha}
        lag=diagnostics["lm_lag"]["significant"] and diagnostics["robust_lm_lag"]["significant"]
        error=diagnostics["lm_error"]["significant"] and diagnostics["robust_lm_error"]["significant"]
        suggestion="spatial_lag" if lag and not error else "spatial_error" if error and not lag else "ambiguous" if lag or error else "ols"
        selected=suggestion if requested=="auto" and suggestion in ("spatial_lag","spatial_error") else "ols" if requested in ("auto","ols","diagnostics") else requested
        decision={"requested":requested,"selected":selected,"suggested":suggestion,"alpha":alpha,"rule":"LM clásico y robusto deben ser significativos para una única familia; ambigüedad conserva OLS.","selection_kind":"diagnostic_rule" if requested=="auto" else "explicit_user_choice","warning":"Diagnósticos orientativos bajo supuestos asintóticos; revisar teoría, endogeneidad, heterocedasticidad y especificación antes de decidir."}
        baseline.update({"diagnostics":diagnostics,"model_selection":decision,"estimator_version":spreg.__version__})
        if selected=="ols":return baseline
        if len(y)>300:raise AnalysisError("Spatial Lag/Error admite hasta 300 observaciones para acotar memoria y tiempo.")
        common={"w":reference,"method":"LU","name_x":names,"name_y":payload["variable"],"epsilon":1e-7}
        if selected=="spatial_lag":
            fitted=spreg.ML_Lag(y[:,None],x[:,1:],spat_impacts="simple",spat_diag=False,**common)
            parameter=float(fitted.rho);parameter_name="rho"
        else:
            fitted=spreg.ML_Error(y[:,None],x[:,1:],**common)
            parameter=float(fitted.lam);parameter_name="lambda"
    if not math.isfinite(parameter) or abs(parameter)>=.999:
        raise AnalysisError("El parámetro espacial alcanzó el borde de estabilidad; revisa modelo y pesos.")
    coefficients=[]
    for name,b,se,ztest in zip(["intercept"]+names+[parameter_name],fitted.betas.ravel(),fitted.std_err,fitted.z_stat):
        if not all(math.isfinite(float(v)) for v in (b,se,ztest[0],ztest[1])):raise AnalysisError("Estimación espacial numéricamente indefinida.")
        coefficients.append({"name":name,"coefficient":float(b),"standard_error":float(se),"z_statistic":float(ztest[0]),"p_value":float(ztest[1]),"inference":"asymptotic normal ML"})
    residuals=np.asarray(fitted.u).ravel()
    result={"method":"Maximum likelihood Spatial Lag" if selected=="spatial_lag" else "Maximum likelihood Spatial Error","model":selected,"estimator":"spreg","estimator_version":spreg.__version__,"coefficients":coefficients,"spatial_parameter":{"name":parameter_name,"value":parameter},"pseudo_r_squared":float(fitted.pr2),"log_likelihood":float(fitted.logll),"aic":float(fitted.aic),"bic":float(fitted.schwarz),"diagnostics":diagnostics,"model_selection":decision,"ols_baseline":baseline,"residual_moran":moran(residuals,w,payload),"warnings":baseline["warnings"]+["Modelos ML asumen especificación y errores adecuados; p asintóticos no garantizan validez en muestras pequeñas."]}
    if selected=="spatial_error":
        result["filtered_innovation_moran"]=moran(np.asarray(fitted.e_filtered).ravel(),w,payload)
        result["warnings"].append("En Spatial Error los residuos originales pueden conservar autocorrelación; evalúa también las innovaciones filtradas.")
    else:
        multipliers=fitted.sp_multipliers.get("simple")
        result["impacts"]=[{"name":name,"average_direct":float(b*multipliers[0]),"average_indirect":float(b*multipliers[1]),"average_total":float(b*multipliers[2])} for name,b in zip(names,fitted.betas.ravel()[1:-1])] if multipliers else []
        result["warnings"].append("Los coeficientes SAR no son efectos marginales totales; los impactos simples reportados son aproximados y no causales.")
    result["estimation_warnings"]=list(dict.fromkeys(str(item.message) for item in captured))[:5]
    return result


def run(payload):
    if not isinstance(payload,dict):raise AnalysisError("Se requiere un objeto JSON.")
    started=time.perf_counter();operation=payload.get("operation","recommend")
    if operation=="temporal":
        periods=payload.get("periods");method=payload.get("method","moran")
        aggregation=None
        if periods is None and payload.get("time"):
            try:periods,aggregation=rolling_periods(payload)
            except ValueError as exc:raise AnalysisError(str(exc)) from exc
        if not isinstance(periods,list) or not 2<=len(periods)<=12 or method not in ("moran","local_moran","gi_star","kde"):raise AnalysisError("Temporal requiere 2–12 períodos y un método espacial compatible.")
        if any(not isinstance(p,dict) for p in periods):raise AnalysisError("Períodos deben ser objetos.")
        labels=[p.get("label") for p in periods]
        if any(not isinstance(v,str) or not v for v in labels) or len(set(labels))!=len(labels):raise AnalysisError("Etiquetas temporales únicas requeridas.")
        outputs=[]; base={**payload};base.pop("periods",None)
        if payload.get("change_test") and method=="kde":raise AnalysisError("La prueba de cambio requiere unidades territoriales; KDE solo compara superficies descriptivas.")
        prepared_periods=[prepare({**base,"operation":method,"data":period.get("data")},method!="kde") for period in periods]
        boxes=[period["report"]["bbox_wgs84"] for period in prepared_periods]
        base["analysis_extent"]=[min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes)]
        if method=="kde":
            prepared_periods=[prepare({**base,"operation":method,"data":period.get("data")}) for period in periods]
            xy=np.vstack([p["xy"] for p in prepared_periods]);h=number(payload.get("density",{}).get("bandwidth_m"),"bandwidth_m",True)
            common_extent=[float(xy[:,0].min()-3*h),float(xy[:,1].min()-3*h),float(xy[:,0].max()+3*h),float(xy[:,1].max()+3*h)]
            base["density"]={**payload.get("density",{}),"extent_m":common_extent}
        else:
            geometry_orders=[[g.wkb_hex for g in p["geographic"]] for p in prepared_periods]
            if any(order!=geometry_orders[0] for order in geometry_orders):raise AnalysisError("Las unidades espaciales deben conservar sus geometrías entre períodos.")
        for period in periods:
            config={**base,"operation":method,"data":period.get("data")}
            outputs.append({"period":period["label"],"interval":period.get("interval"),"analysis":run(config)})
        orders=[o["analysis"]["weights"]["order"] for o in outputs if "weights" in o["analysis"]]
        if orders and any(order!=orders[0] for order in orders):raise AnalysisError("Los períodos requieren las mismas unidades e idéntico orden para comparar clusters.")
        comparison={"statistical_change_test":False}
        if aggregation:comparison["aggregation"]=aggregation
        if payload.get("change_test"):
            try:
                tw,_,_=weights(prepared_periods[0],payload.get("weights",{}))
                comparison["change_test"]=paired_change(prepared_periods[0]["y"],prepared_periods[-1]["y"],tw,payload["change_test"],inference(payload,len(prepared_periods[0]["ids"])),permutation_p)
            except ValueError as exc:raise AnalysisError(str(exc)) from exc
            comparison["statistical_change_test"]=True
        if payload.get("trends"):
            if method=="kde":raise AnalysisError("Tendencias requieren unidades territoriales estables.")
            try:comparison["trends"]=descriptive_trends(prepared_periods,labels)
            except ValueError as exc:raise AnalysisError(str(exc)) from exc
        if method=="moran":
            comparison["series"]=[{"period":o["period"],"statistic":o["analysis"]["result"]["statistic"],"p_value":o["analysis"]["result"]["p_value"]} for o in outputs]
        elif method in ("gi_star","local_moran"):
            categories=[[r["category"] for r in o["analysis"]["result"]["observations"]] for o in outputs]
            comparison["territories"]=[{"id":identifier,"categories":[c[i] for c in categories],"hotspot_periods":sum(c[i] in ("HOTSPOT","HH") for c in categories),"persistent_hotspot":all(c[i] in ("HOTSPOT","HH") for c in categories),"transitions":[{"from":labels[t-1],"to":labels[t],"previous":categories[t-1][i],"current":categories[t][i]} for t in range(1,len(labels)) if categories[t-1][i]!=categories[t][i]]} for i,identifier in enumerate(orders[0])]
        else:
            grids=[np.array(o["analysis"]["result"]["grid"],dtype=float) for o in outputs]
            delta=grids[-1]-grids[0]
            comparison.update({"first_period":labels[0],"last_period":labels[-1],"density_difference_grid":[[float(v) if math.isfinite(v) else None for v in row] for row in delta],"unit":"weighted observations per square metre","common_grid":True})
        return {"version":VERSION,"runtime_versions":RUNTIME,"operation":operation,"periods":outputs,"comparison":comparison,"interpretation":"Análisis espaciales repetidos por períodos; persistencia, transiciones y diferencias son descriptivas y no constituyen pruebas de cambio estadísticamente significativo.","duration_ms":(time.perf_counter()-started)*1000}
    allowed=("validate","weights","recommend","moran","local_moran","gi_star","kde","regression")
    if operation not in allowed:raise AnalysisError("Operación no admitida.")
    prepared=prepare(payload,operation in ("moran","local_moran","gi_star","regression") or bool(payload.get("variable")) and operation in ("validate","recommend"))
    output={"version":VERSION,"operation":operation,"validation":prepared["report"],"dataset_sha256":hashlib.sha256(json.dumps(payload.get("data"),sort_keys=True,allow_nan=False).encode()).hexdigest(),"source":payload.get("source",{"type":"ORGANIZATION_PROVIDED","verified":False}),"parameters":{key:value for key,value in payload.items() if key not in ("data","source")}}
    output["runtime_versions"]=RUNTIME
    if prepared.get("invalid") or operation=="validate":
        output["duration_ms"]=(time.perf_counter()-started)*1000
        return output
    if operation=="recommend":
        polygon=all(g.geom_type in ("Polygon","MultiPolygon") for g in prepared["projected"])
        output["recommendations"]=[{"method":"queen" if polygon else "knn","reason":"Contigüidad de unidades poligonales" if polygon else "Proximidad métrica entre observaciones"}]
        if payload.get("variable"):
            y=prepared["y"]
            output["variable_summary"]={"count":len(y),"mean":float(y.mean()),"standard_deviation":float(y.std()),"minimum":float(y.min()),"maximum":float(y.max())}
            if len(y)>=4 and float(y.std())>0:
                output["recommendations"].extend([{"method":method,"reason":reason} for method,reason in (("moran","Variable numérica no constante con al menos cuatro observaciones; evaluar dependencia global"),("local_moran","Localizar clusters y atípicos, con pruebas condicionales y corrección múltiple"),("gi_star","Evaluar concentraciones locales de valores altos o bajos con significancia corregida"))])
            else:output["recommendations"].append({"method":"descriptive_only","reason":"Variable constante o muestra insuficiente para inferencia espacial"})
        if all(g.geom_type=="Point" for g in prepared["projected"]):output["recommendations"].append({"method":"kde","reason":"Describir densidad de eventos observados, sin inferir riesgo futuro"})
    elif operation=="kde":output["result"]=density(prepared,payload)
    else:
        w,raw,info=weights(prepared,payload.get("weights",{}));output["weights"]=info
        if operation=="weights":
            coo=w.tocoo();output["result"]={"shape":list(w.shape),"rows":coo.row.tolist(),"columns":coo.col.tolist(),"values":coo.data.tolist()}
        elif operation=="moran":output["result"]=moran(prepared["y"],w,payload)
        elif operation in ("local_moran","gi_star"):output["result"]=local_statistics(prepared,w,raw,payload,operation=="gi_star")
        elif operation=="regression":output["result"]=regression(prepared,w,payload)
    output["duration_ms"]=(time.perf_counter()-started)*1000
    return output


if __name__=="__main__":
    try:
        raw=sys.stdin.buffer.read(4000001)
        if len(raw)>4000000:raise AnalysisError("Entrada máxima 4 MB.")
        result=run(json.loads(raw,parse_constant=lambda _: (_ for _ in ()).throw(AnalysisError("JSON no finito"))))
        print(json.dumps({"ok":True,"result":result},allow_nan=False,ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"ok":False,"error":str(exc),"error_type":type(exc).__name__},ensure_ascii=False));sys.exit(1)
