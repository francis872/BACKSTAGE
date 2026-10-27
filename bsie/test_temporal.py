import copy
import unittest
import numpy as np
from bsie.engine import run,AnalysisError
from bsie.test_engine import grid
from bsie.temporal import rolling_periods


def periods_fixture():
    data=grid();base=copy.deepcopy(data['data']);periods=[]
    for index,date in enumerate(['2026-01-01','2026-01-11','2026-01-21']):
        features=copy.deepcopy(base)
        for f in features['features']:f['properties']['value']+=index*5
        periods.append({'label':date,'data':features})
    data.update(operation='temporal',method='moran',periods=periods,permutations=199,trends=True,change_test={'statistic':'mean_change','assume_exchangeable_pairs':True})
    return data


class TemporalTests(unittest.TestCase):
    def test_paired_change_and_descriptive_trend(self):
        data=periods_fixture();comparison=run(data)['comparison']
        self.assertTrue(comparison['statistical_change_test'])
        self.assertEqual(comparison['change_test']['observed_change'],10)
        self.assertTrue(comparison['change_test']['significant'])
        self.assertGreaterEqual(comparison['change_test']['p_value'],1/200)
        for row in comparison['trends']['territories']:self.assertAlmostEqual(row['slope_per_day'],.5)
        self.assertEqual(comparison,run(data)['comparison'])

    def test_explicit_null_and_dates_required(self):
        data=periods_fixture();data['change_test']['assume_exchangeable_pairs']=False
        with self.assertRaises(AnalysisError):run(data)
        data=periods_fixture();data['periods'][1]['label']='nondated'
        with self.assertRaises(AnalysisError):run(data)

    def test_zero_mean_change_has_no_significance(self):
        data=periods_fixture();data['trends']=False;data['periods'][-1]['data']=copy.deepcopy(data['periods'][0]['data'])
        result=run(data)['comparison']['change_test']
        self.assertEqual(result['observed_change'],0);self.assertEqual(result['p_value'],1);self.assertFalse(result['significant'])

    def test_moran_change_statistic_is_difference_not_two_pvalues(self):
        data=periods_fixture();data['change_test']['statistic']='moran_change'
        result=run(data)
        expected=result['periods'][-1]['analysis']['result']['statistic']-result['periods'][0]['analysis']['result']['statistic']
        self.assertAlmostEqual(result['comparison']['change_test']['observed_change'],expected,12)
        self.assertFalse(result['comparison']['change_test']['significant'])

    def test_rolling_half_open_windows_mean_and_overlap(self):
        data=grid(2);events=[]
        for index,date in enumerate(['2026-01-01T00:00:00Z','2026-01-11T00:00:00Z','2026-01-21T00:00:00Z']):
            for feature in data['data']['features']:
                f=copy.deepcopy(feature);f['id']=f'{index}:{f["id"]}';f['properties'].update(territory_id=feature['id'],observed_at=date,value=index+1);events.append(f)
        data.update(data={'type':'FeatureCollection','features':events},time={'property':'observed_at','unit_property':'territory_id','start':'2026-01-01','end':'2026-01-31','window_days':10,'step_days':10,'aggregation':'mean'})
        periods,report=rolling_periods(data)
        self.assertEqual([p['data']['features'][0]['properties']['value'] for p in periods],[1,2,3]);self.assertFalse(report['overlapping'])
        data['time'].update(window_days=20,step_days=10)
        periods,report=rolling_periods(data);self.assertTrue(report['overlapping']);self.assertEqual(len(periods),2)
        self.assertEqual(periods[0]['data']['features'][0]['properties']['value'],1.5)
        data['time']['aggregation']='count'
        self.assertEqual(rolling_periods(data)[0][0]['data']['features'][0]['properties']['value'],2)

    def test_rolling_rejects_missing_units_and_large_work(self):
        data=grid();data['time']={'property':'t','unit_property':'id','start':'2026-01-01','end':'2026-12-31','window_days':1,'step_days':1}
        for f in data['data']['features']:f['properties'].update(id=f['id'],t='2026-01-01T00:00:00Z')
        with self.assertRaises(ValueError):rolling_periods(data)
        data['time']['aggregation']='count'
        with self.assertRaisesRegex(ValueError,'12 ventanas'):rolling_periods(data)


if __name__=='__main__':unittest.main()
