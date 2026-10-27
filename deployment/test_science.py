import hashlib,hmac,json,time,unittest
from deployment.science import handle

class RpcTests(unittest.TestCase):
    def test_private_signature_expiry_and_engine_allowlist(self):
        secret='isolated test secret with at least 32 characters'
        def call(payload):
            raw=json.dumps(payload).encode();signature=hmac.new(secret.encode(),raw,hashlib.sha256).hexdigest()
            return handle(raw,signature,secret)
        self.assertEqual(handle(b'{}','invalid',secret)[0],401)
        payload={'timestamp_ms':0,'nonce':'isolated-test-nonce','engine':'sanitary','payload':{}}
        self.assertEqual(call(payload)[0],401)
        payload['timestamp_ms']=time.time()*1000;payload['engine']='shell'
        self.assertEqual(call(payload)[0],422)
        payload['engine']='sanitary';payload['payload']={'operation':'unknown'}
        self.assertEqual(call(payload)[0],422)

if __name__=='__main__':unittest.main()
