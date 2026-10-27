"""Bounded temporal aggregation and explicit paired-label change tests."""
import copy
import math
from datetime import datetime, timedelta, timezone
import numpy as np
from scipy import stats


def timestamp(value, date_only=False):
    if not isinstance(value,str):raise ValueError("La fecha debe ser una cadena ISO 8601.")
    if date_only and len(value)==4 and value.isdigit():value += "-01-01"
    try:parsed=datetime.fromisoformat(value.replace("Z","+00:00"))
    except ValueError as exc:raise ValueError("Fecha ISO 8601 inválida.") from exc
    if parsed.tzinfo is None:
        if date_only and len(value)==10:parsed=parsed.replace(tzinfo=timezone.utc)
        else:raise ValueError("La marca de tiempo requiere zona horaria explícita.")
    return parsed.astimezone(timezone.utc)


def rolling_periods(payload):
    config=payload.get("time");data=payload.get("data")
    if not isinstance(config,dict) or not isinstance(data,dict) or data.get("type")!="FeatureCollection":raise ValueError("Ventanas requieren time y data FeatureCollection.")
    features=data.get("features")
    if not isinstance(features,list) or not 2<=len(features)<=1000:raise ValueError("Ventanas admiten entre 2 y 1000 registros fechados.")
    prop=config.get("property");unit=config.get("unit_property")
    if not isinstance(prop,str) or not prop or not isinstance(unit,str) or not unit:raise ValueError("Declara time.property y time.unit_property.")
    start=timestamp(config.get("start"),True);end=timestamp(config.get("end"),True)
    window=config.get("window_days",30);step=config.get("step_days",window)
    for value in (window,step):
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<1 or value>3660:raise ValueError("window_days y step_days deben estar entre 1 y 3660.")
    if end<=start:raise ValueError("El intervalo temporal debe ser creciente.")
    aggregation=config.get("aggregation","mean");variable=payload.get("variable")
    if aggregation not in ("mean","sum","count"):raise ValueError("Agregación temporal: mean, sum o count.")
    if not isinstance(variable,str) or not variable:raise ValueError("Declara variable para la salida agregada.")
    units={};observations=[];ignored=0
    for feature in features:
        if not isinstance(feature,dict) or feature.get("type")!="Feature" or not isinstance(feature.get("properties"),dict):raise ValueError("Registro temporal Feature inválido.")
        properties=feature["properties"];raw_id=properties.get(unit)
        if not isinstance(raw_id,(str,int)) or isinstance(raw_id,bool) or not str(raw_id) or len(str(raw_id))>120:raise ValueError("Identificador territorial temporal inválido.")
        identifier=str(raw_id);geom=feature.get("geometry")
        if identifier in units and units[identifier]!=geom:raise ValueError("Una unidad temporal debe conservar la misma geometría.")
        units[identifier]=copy.deepcopy(geom);date=timestamp(properties.get(prop))
        if date<start or date>=end:ignored+=1;continue
        value=1 if aggregation=="count" else properties.get(variable)
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value):raise ValueError("Variable temporal ausente o no finita.")
        observations.append((identifier,date,float(value)))
    periods=[];cursor=start
    while cursor+timedelta(days=window)<=end:
        if len(periods)>=12:raise ValueError("La configuración produce más de 12 ventanas; amplía paso o reduce intervalo.")
        until=cursor+timedelta(days=window);buckets={identifier:[] for identifier in units}
        for identifier,date,value in observations:
            if cursor<=date<until:buckets[identifier].append(value)
        if aggregation!="count" and any(not values for values in buckets.values()):raise ValueError("Hay unidades sin observaciones en una ventana; no se imputan valores ausentes.")
        rows=[{"type":"Feature","id":identifier,"geometry":geometry,"properties":{variable:len(buckets[identifier]) if aggregation=="count" else float(np.mean(buckets[identifier])) if aggregation=="mean" else float(sum(buckets[identifier]))}} for identifier,geometry in units.items()]
        periods.append({"label":cursor.isoformat(),"interval":{"start":cursor.isoformat(),"end":until.isoformat(),"closure":"[start,end)"},"data":{"type":"FeatureCollection","features":rows}})
        cursor+=timedelta(days=step)
    if len(periods)<2:raise ValueError("La configuración requiere al menos dos ventanas completas.")
    return periods,{"aggregation":aggregation,"window_days":window,"step_days":step,"overlapping":step<window,"ignored_outside_interval":ignored,"count_scope":"Registros aportados por unidad, no población ni cobertura completa.","missing_policy":"error; no imputation"}


def paired_change(first,last,w,config,settings,p_function):
    if not isinstance(config,dict):raise ValueError("change_test debe ser un objeto.")
    statistic=config.get("statistic","mean_change")
    if statistic not in ("mean_change","moran_change"):raise ValueError("Prueba de cambio: mean_change o moran_change.")
    b,seed,alpha,alternative=settings;n=len(first);s0=float(w.sum())
    if config.get("assume_exchangeable_pairs") is not True:raise ValueError("La prueba requiere declarar assume_exchangeable_pairs=true y revisar la intercambiabilidad de etiquetas temporales por unidad.")
    def calculate(a,z):
        if statistic=="mean_change":return float(np.mean(z-a))
        def m(y):
            centered=y-y.mean();ss=float(centered@centered)
            if ss<=0:raise ValueError("Una permutación produjo varianza cero; la prueba de cambio Moran no está definida.")
            return float(n/s0*(centered@(w@centered))/ss)
        return m(z)-m(a)
    observed=calculate(first,last);rng=np.random.default_rng(seed);simulations=np.empty(b)
    for iteration in range(b):
        swaps=rng.integers(0,2,size=n).astype(bool)
        simulations[iteration]=calculate(np.where(swaps,last,first),np.where(swaps,first,last))
    p=float(p_function(observed,simulations,0,alternative))
    return {"statistic":statistic,"observed_change":observed,"p_value":p,"significant":p<=alpha,"alpha":alpha,"permutations":b,"seed":seed,"alternative":alternative,"minimum_monte_carlo_p":1/(b+1),"null_model":"independent within-unit exchange of first/last time labels","scope":"single predefined first-vs-last comparison; no correction across exploratory repeated requests","assumptions":["Etiquetas temporales intercambiables dentro de cada unidad bajo H0.","Intercambios por unidad compatibles con el diseño muestral; dependencia entre pares o tendencias pueden invalidar esta prueba.","No es una prueba general que controle toda dependencia espacio-temporal."],"interpretation":"Hay evidencia de cambio bajo el modelo de intercambio declarado; no implica causalidad." if p<=alpha else "No hay evidencia suficiente de cambio bajo el modelo de intercambio declarado."}


def descriptive_trends(prepared_periods,labels):
    if len(labels)<3:raise ValueError("Tendencias requieren al menos tres períodos.")
    dates=[timestamp(label,True) for label in labels]
    if any(dates[i]<=dates[i-1] for i in range(1,len(dates))):raise ValueError("Las fechas de tendencia deben ser estrictamente crecientes.")
    elapsed=np.array([(date-dates[0]).total_seconds()/86400 for date in dates])
    output=[]
    for i,identifier in enumerate(prepared_periods[0]["ids"]):
        values=[float(period["y"][i]) for period in prepared_periods]
        slope,intercept,_,_=stats.theilslopes(values,elapsed)
        output.append({"id":identifier,"values":values,"slope_per_day":float(slope),"intercept":float(intercept),"direction":"increasing" if slope>0 else "decreasing" if slope<0 else "flat"})
    return {"method":"Theil-Sen descriptive slope","dates":[date.isoformat() for date in dates],"territories":output,"significance_test":False,"warning":"Pendiente descriptiva; no prueba significancia y no corrige autocorrelación serial."}
