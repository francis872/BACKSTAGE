from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

import numpy as np
from scipy import stats

from statistical_engine import (
    FittedDistribution,
    TailThresholds,
    bhattacharyya_from_bins,
    ecdf,
    evaluate_observation,
    histogram_density,
    ks_distance_explicit,
    load_dataset,
    run_full_analysis,
)


class StatisticalEngineTests(unittest.TestCase):
    def test_ecdf_sorts_observations_and_uses_empirical_ranks(self):
        values, probabilities = ecdf(np.array([3.0, 1.0, 2.0]))
        np.testing.assert_array_equal(values, [1.0, 2.0, 3.0])
        np.testing.assert_allclose(probabilities, [1 / 3, 2 / 3, 1])

    def test_histogram_density_integrates_to_one(self):
        density, edges, widths, integral = histogram_density(np.array([0.0, 0.25, 0.75, 1.0]), bins=2)
        self.assertEqual(len(density), 2)
        self.assertEqual(len(edges), 3)
        self.assertAlmostEqual(integral, 1.0)
        self.assertAlmostEqual(float(np.sum(density * widths)), 1.0)

    def test_explicit_kolmogorov_smirnov_distance_has_known_uniform_case(self):
        distance = ks_distance_explicit(np.array([0.25, 0.75]), stats.uniform, (0.0, 1.0))
        self.assertAlmostEqual(distance, 0.25)

    def test_bhattacharyya_distance_is_zero_for_matching_binned_density(self):
        coefficient, distance = bhattacharyya_from_bins(
            np.array([0.5, 0.5]),
            np.array([0.0, 0.5, 1.0]),
            np.array([0.5, 0.5]),
            stats.uniform,
            (0.0, 1.0),
        )
        self.assertAlmostEqual(coefficient, 1.0)
        self.assertAlmostEqual(distance, 0.0)

    def test_cdf_and_survival_are_complements_at_the_median(self):
        fitted = FittedDistribution(
            name="Uniform",
            scipy_name="uniform",
            distribution=stats.uniform,
            params=(0.0, 1.0),
            ks_distance=0.0,
            ks_distance_scipy=0.0,
            bhattacharyya_distance=0.0,
            bhattacharyya_coefficient=1.0,
            h_integral=1.0,
            f_integral=1.0,
            histogram_bins=2,
        )
        result = evaluate_observation(0.5, fitted, TailThresholds())
        self.assertAlmostEqual(result["cdf"], 0.5)
        self.assertAlmostEqual(result["survival_probability"], 0.5)
        self.assertEqual(result["location"], "central")

    def test_full_analysis_executes_against_bundled_dataset(self):
        dataset_path = Path(__file__).with_name("Backstage_Dataset_Probabilistico.csv")
        data = load_dataset(dataset_path)
        sample = data["pedestrian_flow_day"].dropna().to_numpy(dtype=float)
        self.assertEqual(sample.size, 800)

        with TemporaryDirectory(prefix="backstage-probability-test-") as temporary_directory:
            summary = run_full_analysis(
                sample=sample,
                output_dir=Path(temporary_directory),
                x_selected=float(np.median(sample)),
                bins=30,
                threshold_q=0.2,
                tail_thresholds=TailThresholds(left_tail=0.05, right_tail=0.95),
                provenance={
                    "dataset": dataset_path.name,
                    "variable": "pedestrian_flow_day",
                    "data_sources": ["Sintético"],
                    "source_count": 1,
                    "data_mode": "procedural",
                    "missing_values": 0,
                    "missing_inputs": [],
                },
            )
            observation = summary["observation_evaluation"]
            self.assertTrue(summary["selected_distribution"])
            self.assertEqual(summary["algorithm_version"], "backstage-probability-fit-v1")
            self.assertEqual(summary["data_mode"], "procedural")
            self.assertIsNone(summary["confidence_score"])
            self.assertEqual(summary["source_count"], 1)
            self.assertAlmostEqual(observation["cdf"] + observation["survival_probability"], 1.0, places=10)
            self.assertAlmostEqual(summary["integral_validation"]["h_integral"], 1.0, places=10)
            self.assertGreater(summary["integral_validation"]["f_integral"], 0.98)
            self.assertTrue((Path(temporary_directory) / "analysis_summary.json").is_file())
            self.assertTrue((Path(temporary_directory) / "results.csv").is_file())


if __name__ == "__main__":
    unittest.main()