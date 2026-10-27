"""SOI scientific execution entry; shares Backstage's bounded Node bridge."""
import json
import sys
import time
if __package__:
    from .routing import solve
    from .predictive import forecast,anomalies
else:
    from routing import solve
    from predictive import forecast,anomalies


def run(payload):
    if not isinstance(payload,dict):raise ValueError('Se requiere un objeto JSON.')
    operation=payload.get('operation');started=time.perf_counter()
    handlers={'optimize_routes':solve,'forecast':forecast,'anomalies':anomalies}
    if operation not in handlers:raise ValueError('Operación científica sanitaria no admitida.')
    result=handlers[operation](payload)
    return{'version':'soi-scientific-1.0.0','operation':operation,'result':result,'duration_ms':(time.perf_counter()-started)*1000}


if __name__=='__main__':
    try:
        raw=sys.stdin.buffer.read(4000001)
        if len(raw)>4000000:raise ValueError('Entrada máxima 4 MB.')
        payload=json.loads(raw,parse_constant=lambda _:(_ for _ in ()).throw(ValueError('JSON no finito')))
        print(json.dumps({'ok':True,'result':run(payload)},allow_nan=False,ensure_ascii=False))
    except Exception as error:
        print(json.dumps({'ok':False,'error':str(error),'error_type':type(error).__name__},ensure_ascii=False));sys.exit(1)
