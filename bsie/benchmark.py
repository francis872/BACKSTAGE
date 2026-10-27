"""Measured synthetic compute benchmarks, no operational writes or network."""
import ctypes
import json
import platform
import subprocess
import sys
import time
from pathlib import Path
from bsie.engine import prepare, weights, moran


def peak_memory():
    if sys.platform=="win32":
        from ctypes import wintypes
        class Counters(ctypes.Structure):
            _fields_=[("cb",wintypes.DWORD),("PageFaultCount",wintypes.DWORD)]+[(key,ctypes.c_size_t) for key in ("PeakWorkingSetSize","WorkingSetSize","QuotaPeakPagedPoolUsage","QuotaPagedPoolUsage","QuotaPeakNonPagedPoolUsage","QuotaNonPagedPoolUsage","PagefileUsage","PeakPagefileUsage")]
        counters=Counters();counters.cb=ctypes.sizeof(counters)
        ctypes.windll.kernel32.GetCurrentProcess.restype=wintypes.HANDLE
        ctypes.windll.psapi.GetProcessMemoryInfo.argtypes=[wintypes.HANDLE,ctypes.POINTER(Counters),wintypes.DWORD]
        if ctypes.windll.psapi.GetProcessMemoryInfo(ctypes.windll.kernel32.GetCurrentProcess(),ctypes.byref(counters),counters.cb):return int(counters.PeakWorkingSetSize)
        return None
    import resource
    value=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(value if sys.platform=="darwin" else value*1024)


def case(n):
    features=[{"type":"Feature","id":str(i),"geometry":{"type":"Point","coordinates":[-74+(i%32)*.001,4+(i//32)*.001]},"properties":{"value":(i%32)+(i//32)*.1}} for i in range(n)]
    payload={"operation":"moran","data":{"type":"FeatureCollection","features":features},"variable":"value","weights":{"method":"knn","k":4},"permutations":199,"seed":42}
    start=time.perf_counter();prepared=prepare(payload,True);prepared_at=time.perf_counter()
    w,_,info=weights(prepared,payload["weights"]);weights_at=time.perf_counter()
    result=moran(prepared["y"],w,payload);finished=time.perf_counter()
    output={"n":n,"permutations":199,"prepare_ms":(prepared_at-start)*1000,"weights_ms":(weights_at-prepared_at)*1000,"statistic_ms":(finished-weights_at)*1000,"total_compute_ms":(finished-start)*1000,"peak_process_rss_bytes":peak_memory(),"nonzero_weights":info["nonzero"],"result_bytes":len(json.dumps({"weights":info,"result":result}).encode())}
    return output


if __name__=="__main__":
    if len(sys.argv)>1:
        print(json.dumps(case(int(sys.argv[1]))));sys.exit()
    results=[json.loads(subprocess.check_output([sys.executable,"-m","bsie.benchmark",str(n)],text=True)) for n in (25,100,400,1000)]
    artifact={"environment":platform.platform(),"python":sys.version,"dataset":"synthetic regular point grids, not operational data","method":"KNN union k=4 row-standardized; Moran random labeling 199 permutations","measurement":"separate process per size; time excludes Python import/startup and HTTP; peak RSS includes native dependencies","results":results}
    path=Path("docs/evidence/bsie-benchmark.json");path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(artifact,indent=2),encoding="utf-8")
    print(json.dumps(artifact,indent=2))
