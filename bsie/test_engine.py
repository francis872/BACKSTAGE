"""Synthetic mathematical fixtures, never loaded into operational data."""
import copy
import math
import unittest
import numpy as np
from scipy.integrate import quad
from scipy import stats
from bsie.engine import run, prepare, weights, moran, kernel_values, adjusted_p, AnalysisError


def grid(side=4, values=None):
    features = []
    for row in range(side):
        for col in range(side):
            x, y = round(-74+col*.01, 4), round(4+row*.01, 4)
            right, top = round(x+.01, 4), round(y+.01, 4)
            i = row*side+col
            features.append({"type":"Feature", "id":str(i), "geometry":{"type":"Polygon","coordinates":[[[x,y],[right,y],[right,top],[x,top],[x,y]]]}, "properties":{"value":values[i] if values is not None else row+col}})
    return {"operation":"moran", "data":{"type":"FeatureCollection","features":features}, "variable":"value", "weights":{"method":"rook"}, "permutations":99, "seed":42}


class EngineTests(unittest.TestCase):
    def test_rook_queen_grid(self):
        data=grid(3); p=prepare(data)
        w, raw, report=weights(p,{"method":"rook"})
        self.assertEqual(raw.nnz,24)
        self.assertEqual(report["neighbor_counts"],[2,3,2,3,4,3,2,3,2])
        np.testing.assert_allclose(np.asarray(w.sum(axis=1)).ravel(),1)
        self.assertEqual(weights(p,{"method":"queen"})[1].nnz,40)
        self.assertEqual(np.diag(w.toarray()).sum(),0)

    def test_moran_manual_and_reproducible(self):
        data=grid(); p=prepare(data,True); w,_,_=weights(p,data["weights"])
        z=p["y"]-p["y"].mean()
        expected=len(z)/w.sum()*sum(w[i,j]*z[i]*z[j] for i in range(len(z)) for j in range(len(z)))/(z@z)
        result=run(data)["result"]
        self.assertAlmostEqual(result["statistic"],expected,12)
        self.assertEqual(result,run(data)["result"])
        self.assertEqual(result["expected"],-1/15)
        self.assertGreaterEqual(result["p_value"],.01)
        self.assertGreater(result["statistic"],0)

    def test_negative_pattern(self):
        data=grid(4,[(-1)**(i//4+i%4) for i in range(16)])
        result=run(data)["result"]
        self.assertAlmostEqual(result["statistic"],-1)
        self.assertLessEqual(result["p_value"],.05)

    def test_validation_and_repair_do_not_mutate(self):
        data=grid(); original=copy.deepcopy(data)
        run(data); self.assertEqual(data,original)
        data["data"]["features"][0]["geometry"]={"type":"Point","coordinates":[190,4]}
        with self.assertRaises(AnalysisError):run(data)
        data["operation"]="validate"
        self.assertFalse(run(data)["validation"]["valid"])
        data=grid(); data["data"]["features"][0]["properties"]=None
        with self.assertRaises(AnalysisError):run(data)

    def test_degeneracy_and_islands(self):
        with self.assertRaises(AnalysisError):run(grid(3,[2]*9))
        data=grid();data["weights"]={"method":"distance_band","distance_m":1}
        with self.assertRaises(AnalysisError):run(data)
        data["operation"]="weights"
        self.assertEqual(len(run(data)["weights"]["islands"]),16)
        data["weights"]={"method":"knn","k":16}
        with self.assertRaises(AnalysisError):run(data)

    def test_explicit_repair_and_missing_values(self):
        data=grid();data["operation"]="validate"
        data["data"]["features"][0]["geometry"]={"type":"Polygon","coordinates":[[[-74,4],[-73.995,4.005],[-74,4.005],[-73.995,4],[-74,4]]]}
        original=copy.deepcopy(data)
        self.assertFalse(run(data)["validation"]["valid"])
        data["repair_invalid"]=True
        result=run(data)
        self.assertTrue(result["validation"]["valid"])
        self.assertEqual(result["validation"]["repairs"][0]["id"],"0")
        self.assertEqual(data["data"],original["data"])
        data["data"]["features"][0]["properties"]["value"]=None
        self.assertFalse(run(data)["validation"]["valid"])

    def test_local_and_hotspot_inference(self):
        for operation in ("local_moran","gi_star"):
            data=grid();data["operation"]=operation
            output=run(data)["result"]
            self.assertEqual(len(output["observations"]),16)
            for item in output["observations"]:
                if item["p_value"] is not None:
                    self.assertGreaterEqual(item["p_value"],.01)
                    self.assertGreaterEqual(item["adjusted_p"]+1e-12,item["p_value"])
                    if item["adjusted_p"]>.05:self.assertEqual(item["category"],"NOT_SIGNIFICANT")
            self.assertEqual(output,run(data)["result"])

    def test_bh_against_scipy(self):
        p=np.array([.01,.05,.004,.7,.02,.9])
        np.testing.assert_allclose(adjusted_p(p,"bh"),stats.false_discovery_control(p))

    def test_all_kernel_mass(self):
        for kernel in ("gaussian","quartic","epanechnikov","uniform","triangular"):
            mass=quad(lambda r:2*math.pi*r*float(kernel_values(np.array([r]),kernel)[0]),0,10 if kernel=="gaussian" else 1)[0]
            self.assertAlmostEqual(mass,1,8,kernel)

    def test_kde_mass_metric_and_point_only(self):
        data=grid(2);data.update(operation="kde",density={"bandwidth_m":1000,"resolution":64})
        with self.assertRaises(AnalysisError):run(data)
        for feature in data["data"]["features"]:feature["geometry"]={"type":"Point","coordinates":feature["geometry"]["coordinates"][0][0]}
        result=run(data)
        self.assertEqual(result["validation"]["distance_unit"],"metre")
        self.assertAlmostEqual(result["result"]["approximate_integral"],4,delta=.03)
        self.assertEqual(len(result["result"]["geojson"]["features"]),4096)

    def test_ols_matches_scipy(self):
        data=grid();data.update(operation="regression",predictors=["x"])
        for i,f in enumerate(data["data"]["features"]):f["properties"]={"x":i,"value":3+2*i+(-1)**i*.3}
        expected=stats.linregress(range(16),[f["properties"]["value"] for f in data["data"]["features"]])
        result=run(data)["result"]
        self.assertAlmostEqual(result["coefficients"][1]["coefficient"],expected.slope,10)
        self.assertAlmostEqual(result["coefficients"][1]["p_value"],expected.pvalue,10)
        self.assertIsNotNone(result["residual_moran"])

    def test_temporal_requires_identical_units(self):
        data=grid();first=copy.deepcopy(data["data"]);second=copy.deepcopy(first)
        second["features"][0]["id"]="changed"
        data.update(operation="temporal",periods=[{"label":"a","data":first},{"label":"b","data":second}])
        with self.assertRaises(AnalysisError):run(data)

    def test_temporal_series_persistence_and_shared_kde_grid(self):
        data=grid();first=copy.deepcopy(data["data"])
        data.update(operation="temporal",method="gi_star",periods=[{"label":"2025","data":first},{"label":"2026","data":first}])
        output=run(data)
        self.assertFalse(output["comparison"]["statistical_change_test"])
        self.assertEqual(len(output["comparison"]["territories"]),16)
        self.assertTrue(all(not t["transitions"] for t in output["comparison"]["territories"]))
        for f in first["features"]:f["geometry"]={"type":"Point","coordinates":f["geometry"]["coordinates"][0][0]}
        data.update(method="kde",density={"bandwidth_m":1000,"resolution":8})
        output=run(data)
        self.assertTrue(output["comparison"]["common_grid"])
        np.testing.assert_allclose(output["comparison"]["density_difference_grid"],0)

    def test_knn_and_metric_distances(self):
        data=grid(2)
        for i,f in enumerate(data["data"]["features"]):f["geometry"]={"type":"Point","coordinates":[-74+i*.001,4]}
        p=prepare(data)
        distances=np.linalg.norm(np.diff(p["xy"],axis=0),axis=1)
        np.testing.assert_allclose(distances,111.05,atol=.2)
        _,raw,_=weights(p,{"method":"knn","k":1,"symmetry":"directed"})
        np.testing.assert_array_equal(np.diff(raw.indptr),1)
        self.assertEqual(weights(p,{"method":"distance_band","distance_m":120})[1].nnz,6)
        inverse=weights(p,{"method":"inverse_distance","distance_m":120,"transform":"none"})[1]
        np.testing.assert_allclose(inverse.data,1/111.05,atol=.00002)

    def test_moran_no_evidence_is_not_randomness_proof(self):
        values=np.random.default_rng(18).normal(size=16)
        data=grid(4,values);result=run(data)["result"]
        self.assertGreater(result["p_value"],.05)
        self.assertFalse(result["significant"])
        self.assertIn("no demuestra",result["interpretation"])

    def test_pysal_reference(self):
        # Dependency is explicit: missing PySAL fails reference verification.
        from libpysal.weights import W
        from esda.moran import Moran, Moran_Local
        from esda.getisord import G_Local
        data=grid();prepared=prepare(data,True);w,raw,_=weights(prepared,data["weights"])
        neighbors={i:raw.getrow(i).indices.tolist() for i in range(raw.shape[0])}
        reference=W(neighbors,silence_warnings=True)
        self.assertAlmostEqual(run(data)["result"]["statistic"],Moran(prepared["y"],reference,permutations=0).I,12)
        data["operation"]="local_moran"
        local=run(data)["result"]["observations"]
        np.testing.assert_allclose([r["statistic"] for r in local],Moran_Local(prepared["y"],reference,permutations=0).Is,rtol=1e-12,atol=1e-12)
        data["operation"]="gi_star"
        hot=run(data)["result"]["observations"]
        np.testing.assert_allclose([r["statistic"] for r in hot],G_Local(prepared["y"],reference,transform="B",star=True,permutations=0).Zs,rtol=1e-12,atol=1e-12)


if __name__=="__main__":unittest.main()
