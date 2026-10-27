"""Measured mathematical fixtures only; no road or customer data, no network."""
import json
import math
import platform
import time
from datetime import datetime,timedelta,timezone
from pathlib import Path
from sanitary.engine import run

def benchmark():
    results=[]
    for n in (10,50,100):
        coords=[(i%10,i//10) for i in range(n)]
        distances=[[round(math.dist(a,b)*100) for b in coords] for a in coords]
        payload={'operation':'optimize_routes','nodes':[{'id':str(i),'demand_kg':0 if i==0 else 10} for i in range(n)],'vehicles':[{'id':str(i),'capacity_kg':200} for i in range(max(1,math.ceil(n/15)))],'matrix':{'node_ids':[str(i) for i in range(n)],'distance_m':distances,'duration_s':[[distance/5 for distance in row] for row in distances],'source':{'name':'Synthetic grid distance fixture, not actual roads','data_kind':'simulated'}},'time_limit_s':1}
        started=time.perf_counter();output=run(payload)
        result=output['result'];results.append({'operation':'CVRP','nodes':n,'vehicles':len(payload['vehicles']),'compute_ms':(time.perf_counter()-started)*1000,'search_limit_s':1,'feasible':result['feasible'],'independent_validation':result.get('independent_validation'),'input_bytes':len(json.dumps(payload).encode()),'output_bytes':len(json.dumps(output).encode())})
    for n in (100,1000):
        start=datetime.now(timezone.utc)-timedelta(days=n)
        payload={'operation':'forecast','unit':'kg','source':{'name':'Synthetic trend fixture, not customer history','data_kind':'simulated'},'history':[{'time':(start+timedelta(days=i)).isoformat(),'value':10+2*i} for i in range(n)],'horizon':7}
        started=time.perf_counter();output=run(payload)
        results.append({'operation':'forecast','observations':n,'compute_ms':(time.perf_counter()-started)*1000,'status':output['result']['status'],'heldout':output['result']['validation']['heldout_observations'],'output_bytes':len(json.dumps(output).encode())})
    artifact={'measured_at':datetime.now(timezone.utc).isoformat(),'environment':platform.platform(),'scope':'synthetic isolated fixtures, single process; excludes import/startup, HTTP, MongoDB and concurrent production load','results':results}
    Path('docs/evidence/sanitary-benchmark.json').write_text(json.dumps(artifact,indent=2),encoding='utf-8')
    print(json.dumps(artifact,indent=2))

if __name__=='__main__':benchmark()
