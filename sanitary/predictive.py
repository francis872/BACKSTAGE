import hashlib
import json
import math
from datetime import datetime,timedelta,timezone
import numpy as np
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
import sklearn


def history(payload):
    records=payload.get('history')
    if not isinstance(records,list) or not 20<=len(records)<=1000:raise ValueError('Se requieren 20–1000 observaciones históricas.')
    dates=[];values=[]
    for item in records:
        if not isinstance(item,dict) or not isinstance(item.get('time'),str):raise ValueError('Historia requiere time ISO y value.')
        try:date=datetime.fromisoformat(item['time'].replace('Z','+00:00'))
        except ValueError as exc:raise ValueError('Fecha histórica inválida.') from exc
        if date.tzinfo is None:raise ValueError('La fecha histórica requiere zona horaria.')
        date=date.astimezone(timezone.utc)
        if date>datetime.now(timezone.utc)+timedelta(minutes=1):raise ValueError('No se permite entrenar con observaciones futuras.')
        if dates and date<=dates[-1]:raise ValueError('La historia debe estar ordenada y no tener fechas duplicadas.')
        value=item.get('value')
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value):raise ValueError('Valores históricos deben ser numéricos finitos, sin imputación silenciosa.')
        dates.append(date);values.append(float(value))
    delta=np.array([(dates[i]-dates[i-1]).total_seconds() for i in range(1,len(dates))]);step=float(np.median(delta))
    if not np.allclose(delta,step,rtol=.01,atol=1):raise ValueError('La historia debe tener frecuencia regular; agrega y verifica faltantes antes de modelar.')
    if not isinstance(payload.get('source'),dict) or not payload['source'].get('name') or not payload.get('unit'):raise ValueError('Declara fuente y unidad de la serie.')
    return dates,np.array(values),step


def forecast(payload):
    dates,y,step=history(payload);n=len(y);horizon=payload.get('horizon',7);lags=payload.get('lags',min(7,n//5))
    if isinstance(horizon,bool) or not isinstance(horizon,int) or not 1<=horizon<=30:raise ValueError('Horizonte entre 1 y 30 períodos.')
    if isinstance(lags,bool) or not isinstance(lags,int) or not 2<=lags<=30 or n<3*lags+5:raise ValueError('Lags insuficientes o excesivos para la historia.')
    alpha=payload.get('ridge_alpha',1.)
    if isinstance(alpha,bool) or not isinstance(alpha,(int,float)) or not math.isfinite(alpha) or not .001<=alpha<=1000:raise ValueError('ridge_alpha entre 0.001 y 1000.')
    holdout=max(5,n//5);split=n-holdout
    def features(values,index):return [float(values[index-lag]) for lag in range(1,lags+1)]+[float(index),float(np.mean(values[index-lags:index]))]
    def fit_until(index):
        x=np.array([features(y,i) for i in range(lags,index)]);target=y[lags:index]
        model=make_pipeline(StandardScaler(),Ridge(alpha=alpha));model.fit(x,target);return model
    predicted=[];baselines=[];errors=[]
    for i in range(split,n):
        model=fit_until(i);prediction=float(model.predict(np.array([features(y,i)]))[0]);predicted.append(prediction);baselines.append(float(y[i-1]));errors.append(float(y[i]-prediction))
    mae=float(np.mean(np.abs(errors)));rmse=float(np.sqrt(np.mean(np.square(errors))));baseline_mae=float(np.mean(np.abs(y[split:]-baselines)))
    skill=1-mae/baseline_mae if baseline_mae>0 else None;qualified=baseline_mae>0 and skill>=.05
    stale=(datetime.now(timezone.utc)-dates[-1]).total_seconds()>step*2
    result={'model':'ridge_autoregressive','model_version':'soi-predictive-1.0.0','library_version':sklearn.__version__,'status':'BACKTESTED_WITH_SKILL' if qualified else 'INSUFFICIENT_PREDICTIVE_SKILL','unit':payload['unit'],'source':payload['source'],'dataset_sha256':hashlib.sha256(json.dumps(payload['history'],sort_keys=True).encode()).hexdigest(),'training':{'observations':n,'lags':lags,'ridge_alpha':alpha,'last_observation':dates[-1].isoformat(),'frequency_seconds':step},'validation':{'scheme':'rolling_origin_one_step; every fold fits only earlier observations','heldout_observations':holdout,'first_test_time':dates[split].isoformat(),'last_test_time':dates[-1].isoformat(),'mae':mae,'rmse':rmse,'baseline':'last_observed_value','baseline_mae':baseline_mae,'skill_relative_to_baseline':skill,'minimum_skill_gate':.05,'predictions':predicted,'actual':y[split:].tolist()},'forecast':None,'warnings':['Backtest un paso adelante; no acredita precisión multihorizonte ni causalidad.','El modelo se reajusta con la historia completa después de evaluar; las métricas pertenecen a los folds históricos.','No se utilizan variables futuras no observadas ni datos de prueba como entrenamiento dentro de cada fold.']}
    result['history_status']='stale' if stale else 'current_to_declared_cadence'
    result['projection_origin']=dates[-1].isoformat()
    if stale:
        result['status']='STALE_HISTORY';result['warnings'].append('La última observación supera dos intervalos de la serie; no se publica como pronóstico actual.')
    if qualified and not stale or payload.get('allow_exploratory') is True:
        model=fit_until(n);extended=y.tolist();predictions=[];low,high=np.quantile(errors,[.05,.95])
        for index in range(n,n+horizon):
            value=float(model.predict(np.array([features(extended,index)]))[0]);extended.append(value);distance=index-n+1
            simulated=payload['source'].get('data_kind')=='simulated'
            predictions.append({'time':(dates[-1]+timedelta(seconds=step*distance)).isoformat(),'value':value,'lower_empirical':float(value+low*math.sqrt(distance)),'upper_empirical':float(value+high*math.sqrt(distance)),'data_kind':'forecast' if qualified and not stale and not simulated else 'simulated','validation_status':'historical_one_step_only' if qualified and not stale else 'exploratory_not_current_validated_forecast'})
        result['forecast']=predictions;result['interval_method']='empirical signed one-step residual 5–95% quantiles with sqrt(h) heuristic; not calibrated coverage'
    return result


def anomalies(payload):
    dates,y,step=history(payload);cut=int(len(y)*.8);baseline=y[:cut];median=float(np.median(baseline));mad=float(np.median(np.abs(baseline-median)));threshold=payload.get('threshold',3.5)
    if isinstance(threshold,bool) or not isinstance(threshold,(int,float)) or not math.isfinite(threshold) or not 2<=threshold<=10:raise ValueError('Umbral MAD entre 2 y 10.')
    observations=[]
    for date,value in zip(dates[cut:],y[cut:]):
        score=.67448975*(float(value)-median)/mad if mad>0 else None
        flagged=bool(abs(score)>threshold) if score is not None else bool(value!=median)
        observations.append({'time':date.isoformat(),'value':float(value),'robust_z':score,'flagged':flagged,'reason':'robust_z_threshold' if mad>0 else 'outside_constant_reference','data_kind':'simulated' if payload['source'].get('data_kind')=='simulated' else 'estimated'})
    return{'model':'historical_reference_MAD','model_version':'soi-predictive-1.0.0','unit':payload['unit'],'source':payload['source'],'reference':{'first_time':dates[0].isoformat(),'last_time':dates[cut-1].isoformat(),'observations':cut,'median':median,'mad':mad},'evaluation':{'first_time':dates[cut].isoformat(),'observations':observations,'threshold':threshold},'warnings':['Las observaciones evaluadas no se usaron para calibrar mediana/MAD.','Una anomalía estadística no demuestra fallo del sensor ni riesgo sanitario.','Con dispersión histórica cero se informa desviación del valor constante sin inventar z.']}
