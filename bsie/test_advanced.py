import copy
import unittest
import numpy as np
from bsie.engine import run,prepare,weights,AnalysisError
from bsie.test_engine import grid


def spatial_fixture(model):
    data=grid(8);p=prepare(data);w,_,_=weights(p,{"method":"rook"})
    rng=np.random.default_rng(162);x=rng.normal(size=64);noise=rng.normal(size=64)*.3
    base=2+1.5*x
    if model=="spatial_lag":y=np.linalg.solve(np.eye(64)-.5*w.toarray(),base+noise)
    else:y=base+np.linalg.solve(np.eye(64)-.65*w.toarray(),noise)
    for f,a,b in zip(data["data"]["features"],x,y):f["properties"]={"x":float(a),"value":float(b)}
    data.update(operation="regression",predictors=["x"],model=model,permutations=19)
    return data


class AdvancedRegressionTests(unittest.TestCase):
    def test_spatial_lag_recovers_parameter_and_impacts(self):
        data=spatial_fixture("spatial_lag");result=run(data)["result"]
        self.assertEqual(result["model"],"spatial_lag")
        self.assertAlmostEqual(result["spatial_parameter"]["value"],.5,delta=.12)
        self.assertAlmostEqual(result["coefficients"][1]["coefficient"],1.5,delta=.15)
        self.assertEqual(result["coefficients"][-1]["name"],"rho")
        self.assertAlmostEqual(result["impacts"][0]["average_total"],result["coefficients"][1]["coefficient"]/(1-result["spatial_parameter"]["value"]),9)
        self.assertEqual(result,run(data)["result"])

    def test_spatial_error_recovers_parameter_and_filtered_residuals(self):
        result=run(spatial_fixture("spatial_error"))["result"]
        self.assertEqual(result["model"],"spatial_error")
        self.assertEqual(result["coefficients"][-1]["name"],"lambda")
        self.assertAlmostEqual(result["spatial_parameter"]["value"],.65,delta=.25)
        self.assertIsNotNone(result["filtered_innovation_moran"])
        self.assertGreater(result["residual_moran"]["statistic"],result["filtered_innovation_moran"]["statistic"])

    def test_diagnostics_match_spreg_and_auto_explains_selection(self):
        import spreg
        from libpysal.weights import W
        data=spatial_fixture("spatial_lag");data["model"]="auto"
        result=run(data)["result"];p=prepare(data,True);w,_,_=weights(p,data["weights"])
        reference=W({i:w.getrow(i).indices.tolist() for i in range(64)},{i:w.getrow(i).data.tolist() for i in range(64)},silence_warnings=True)
        x=np.array([[f["properties"]["x"]] for f in data["data"]["features"]])
        fit=spreg.OLS(p["y"][:,None],x,nonspat_diag=False)
        lm=spreg.LMtests(fit,reference,tests=['lme','lml','rlme','rlml','sarma'])
        self.assertAlmostEqual(result["diagnostics"]["robust_lm_lag"]["statistic"],float(lm.rlml[0]),10)
        self.assertEqual(result["model_selection"]["selection_kind"],"diagnostic_rule")
        self.assertEqual(result["model_selection"]["selected"],result["model"])
        self.assertEqual(result["model"],"spatial_lag")

    def test_manual_ml_matches_direct_library(self):
        import spreg
        from libpysal.weights import W
        for model in ("spatial_lag","spatial_error"):
            data=spatial_fixture(model);result=run(data)["result"];p=prepare(data,True);w,_,_=weights(p,data["weights"])
            reference=W({i:w.getrow(i).indices.tolist() for i in range(64)},{i:w.getrow(i).data.tolist() for i in range(64)},silence_warnings=True)
            x=np.array([[f["properties"]["x"]] for f in data["data"]["features"]])
            fit=(spreg.ML_Lag if model=="spatial_lag" else spreg.ML_Error)(p["y"][:,None],x,w=reference,method="LU")
            np.testing.assert_allclose([c["coefficient"] for c in result["coefficients"]],fit.betas.ravel(),atol=1e-10)
            self.assertAlmostEqual(result["aic"],float(fit.aic),8)

    def test_diagnostics_reject_undefined_design_and_wrong_weights(self):
        data=spatial_fixture("spatial_lag");data["weights"]["transform"]="none"
        with self.assertRaises(AnalysisError):run(data)
        data=spatial_fixture("spatial_lag")
        for f in data["data"]["features"]:f["properties"]["value"]=3+2*f["properties"]["x"]
        with self.assertRaises(AnalysisError):run(data)
        data=spatial_fixture("spatial_lag");data["model"]="invented"
        with self.assertRaises(AnalysisError):run(data)


if __name__=="__main__":unittest.main()
