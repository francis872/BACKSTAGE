"""Private signed RPC entry for the existing Backstage scientific engines."""
import hashlib
import hmac
import json
import os
import time
from http.server import BaseHTTPRequestHandler

os.environ.setdefault('OMP_NUM_THREADS','1')
os.environ.setdefault('OPENBLAS_NUM_THREADS','1')
os.environ.setdefault('MKL_NUM_THREADS','1')
os.environ.setdefault('PROJ_NETWORK','OFF')
MAX_BYTES=4000000

def handle(raw,signature,secret=None,now=None):
    secret=os.environ.get('SOI_SCIENCE_RPC_SECRET','') if secret is None else secret
    now=time.time() if now is None else now
    if not secret or len(secret)<32:return 503,{'ok':False,'error':'Runtime científico sin configuración privada.'}
    if len(raw)>MAX_BYTES:return 413,{'ok':False,'error':'Entrada superior a 4 MB.'}
    expected=hmac.new(secret.encode(),raw,hashlib.sha256).hexdigest()
    if not isinstance(signature,str) or len(signature)!=64 or any(c not in '0123456789abcdef' for c in signature) or not hmac.compare_digest(expected,signature):return 401,{'ok':False,'error':'Firma no válida.'}
    try:
        request=json.loads(raw,parse_constant=lambda _:(_ for _ in ()).throw(ValueError('JSON no finito')))
        if not isinstance(request,dict):raise ValueError('Sobre RPC inválido.')
        stamp=request.get('timestamp_ms');nonce=request.get('nonce')
        if isinstance(stamp,bool) or not isinstance(stamp,(int,float)) or abs(now*1000-stamp)>60000:return 401,{'ok':False,'error':'Solicitud vencida.'}
        if not isinstance(nonce,str) or not 16<=len(nonce)<=100:raise ValueError('Nonce requerido.')
        if not isinstance(request.get('payload'),dict):raise ValueError('Payload requerido.')
        if request.get('engine')=='bsie':
            from bsie.engine import run
        elif request.get('engine')=='sanitary':
            from sanitary.engine import run
        else:raise ValueError('Motor no admitido.')
        output={'ok':True,'result':run(request['payload'])}
        if len(json.dumps(output,allow_nan=False).encode())>3800000:return 413,{'ok':False,'error':'Resultado superior al límite remoto de 3,8 MB; reduce la consulta.'}
        return 200,output
    except ValueError as error:return 422,{'ok':False,'error':str(error)[:1500]}
    except Exception:return 503,{'ok':False,'error':'El runtime científico no pudo ejecutar la operación.'}

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:length=int(self.headers.get('Content-Length','0'))
        except ValueError:length=MAX_BYTES+1
        if not 0<length<=MAX_BYTES:status,output=413,{'ok':False,'error':'Tamaño de solicitud fuera de rango.'}
        else:status,output=handle(self.rfile.read(length),self.headers.get('X-SOI-Signature',''))
        body=json.dumps(output,allow_nan=False).encode()
        self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def log_message(self,*args):pass
