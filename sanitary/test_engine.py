import copy
import itertools
import unittest
from datetime import datetime,timedelta,timezone
import numpy as np
from sanitary.engine import run
from sanitary.routing import solve
from sanitary.predictive import forecast,anomalies


def routing_fixture():
    distance=[[0,1000,2000,3000],[1000,0,1000,2000],[2000,1000,0,1000],[3000,2000,1000,0]]
    return{'operation':'optimize_routes','nodes':[{'id':str(i),'demand_kg':0 if i==0 else 2,'service_s':0} for i in range(4)],'vehicles':[{'id':'test-vehicle','capacity_kg':10}],'matrix':{'node_ids':['0','1','2','3'],'distance_m':distance,'duration_s':[[v/10 for v in row] for row in distance],'source':{'name':'synthetic mathematical fixture, not roads','data_kind':'simulated'}},'time_limit_s':1}


class RoutingTests(unittest.TestCase):
    def test_matrix_must_declare_matching_node_order(self):
        payload=routing_fixture();payload['matrix']['node_ids']=['1','0','2','3']
        with self.assertRaises(ValueError):solve(payload)

    def test_small_optimum_checked_by_exhaustive_enumeration(self):
        payload=routing_fixture();result=solve(payload)
        distance=payload['matrix']['distance_m'];best=min(sum(distance[a][b] for a,b in zip([0]+list(order),list(order)+[0])) for order in itertools.permutations([1,2,3]))
        self.assertTrue(result['feasible']);self.assertEqual(result['totals']['distance_m'],best)
        self.assertTrue(result['independent_validation']['valid']);self.assertEqual(len(result['served_node_ids']),3)
        self.assertIsNone(result['totals']['estimated_kgco2e']);self.assertIsNone(result['totals']['cost'])

    def test_cvrp_capacity_and_infeasibility(self):
        payload=routing_fixture();payload['vehicles']=[{'id':'A','capacity_kg':4},{'id':'B','capacity_kg':4}]
        result=solve(payload);self.assertTrue(result['feasible']);self.assertTrue(all(r['load_kg']<=4 for r in result['routes']))
        payload['vehicles']=[{'id':'A','capacity_kg':4}]
        self.assertEqual(solve(payload)['status'],'INFEASIBLE_CAPACITY')

    def test_optional_penalty_and_time_windows(self):
        payload=routing_fixture();payload['nodes'][3].update(optional=True,priority=10000,time_window_s=[0,1])
        result=solve(payload);self.assertTrue(result['feasible']);self.assertEqual(result['dropped_node_ids'],['3'])
        self.assertEqual(result['objective']['raw_terms']['penalty'],10000)
        payload['nodes'][3]['optional']=False;self.assertFalse(solve(payload)['feasible'])

    def test_normalized_cost_carbon_and_time_objective(self):
        payload=routing_fixture();payload['currency']='USD';payload['vehicles'][0].update(cost_per_km=2,cost_per_hour=5,emission_kgco2e_per_km=.3,emission_factor_source='explicit synthetic fixture')
        payload['objective']={'weights':{'distance':1,'time':1,'cost':1,'emissions':1,'penalty':1}}
        result=solve(payload);d=result['totals']['distance_m'];t=result['totals']['duration_s']
        self.assertAlmostEqual(result['totals']['cost'],d/1000*2+t/3600*5)
        self.assertAlmostEqual(result['totals']['estimated_kgco2e'],d/1000*.3)
        self.assertAlmostEqual(result['objective']['normalized_weighted_sum'],d/1000+t/3600+result['totals']['cost']+result['totals']['estimated_kgco2e'])

    def test_multidepot_and_reject_fabricated_matrices(self):
        payload=routing_fixture();payload['nodes'][3]['demand_kg']=0;payload['vehicles']=[{'id':'A','capacity_kg':10,'start_index':0},{'id':'B','capacity_kg':10,'start_index':3}]
        result=solve(payload);self.assertTrue(result['feasible']);self.assertEqual(result['routes'][1]['visits'][0]['node_id'],'3');self.assertEqual(result['routes'][1]['visits'][-1]['node_id'],'3')
        payload['matrix']['distance_m'][1][2]=None
        with self.assertRaises(ValueError):solve(payload)
        payload=routing_fixture();payload['objective']={'weights':{'emissions':1}}
        with self.assertRaises(ValueError):solve(payload)


def history_fixture(values):
    start=datetime.now(timezone.utc).replace(hour=0,minute=0,second=0,microsecond=0)-timedelta(days=len(values))
    return{'operation':'forecast','unit':'kg','source':{'name':'synthetic temporal fixture, not operational records'},'history':[{'time':(start+timedelta(days=i)).isoformat(),'value':float(value)} for i,value in enumerate(values)],'horizon':3}


class PredictiveTests(unittest.TestCase):
    def test_stale_history_and_simulated_sources_do_not_publish_current_real_forecasts(self):
        payload=history_fixture(np.arange(80)*2+10)
        payload['source']['data_kind']='simulated';result=forecast(payload)
        self.assertTrue(all(row['data_kind']=='simulated' for row in result['forecast']))
        for row in payload['history']:row['time']=(datetime.fromisoformat(row['time'])-timedelta(days=365)).isoformat()
        result=forecast(payload);self.assertEqual(result['status'],'STALE_HISTORY');self.assertIsNone(result['forecast'])

    def test_forecast_uses_chronological_folds_and_demonstrates_skill(self):
        payload=history_fixture(np.arange(80)*2+10);result=forecast(payload)
        self.assertEqual(result['status'],'BACKTESTED_WITH_SKILL');self.assertGreater(result['validation']['skill_relative_to_baseline'],.05)
        self.assertLess(result['validation']['first_test_time'],result['validation']['last_test_time'])
        self.assertEqual(len(result['forecast']),3);self.assertEqual(result['forecast'][0]['data_kind'],'forecast')
        self.assertAlmostEqual(result['forecast'][0]['value'],170,delta=3)
        self.assertEqual(result,forecast(payload))

    def test_constant_history_does_not_claim_skill_or_publish_unvalidated_forecast(self):
        result=forecast(history_fixture([5]*40));self.assertEqual(result['status'],'INSUFFICIENT_PREDICTIVE_SKILL');self.assertIsNone(result['forecast']);self.assertIsNone(result['validation']['skill_relative_to_baseline'])

    def test_irregular_history_and_insufficient_data_rejected(self):
        payload=history_fixture(range(30));payload['history'][3]['time']=payload['history'][2]['time']
        with self.assertRaises(ValueError):forecast(payload)
        with self.assertRaises(ValueError):forecast(history_fixture(range(10)))

    def test_anomaly_reference_is_separate_from_evaluation(self):
        payload=history_fixture([10]*32+[10,10,99,10,10,10,10,10]);result=anomalies(payload)
        self.assertEqual(result['reference']['observations'],32);self.assertEqual(sum(row['flagged'] for row in result['evaluation']['observations']),1)
        self.assertIsNone(result['evaluation']['observations'][2]['robust_z']);self.assertLess(result['reference']['last_time'],result['evaluation']['first_time'])
        payload['source']['data_kind']='simulated';self.assertTrue(all(row['data_kind']=='simulated' for row in anomalies(payload)['evaluation']['observations']))


if __name__=='__main__':unittest.main()
