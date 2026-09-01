from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats


EPS = 1e-12


@dataclass
class TailThresholds:
    left_tail: float = 0.05
    right_tail: float = 0.95


@dataclass
class FittedDistribution:
    name: str
    scipy_name: str
    distribution: stats.rv_continuous
    params: Tuple[float, ...]
    ks_distance: float
    ks_distance_scipy: float
    bhattacharyya_distance: float
    bhattacharyya_coefficient: float
    h_integral: float
    f_integral: float
    histogram_bins: int

    def pdf(self, x: np.ndarray) -> np.ndarray:
        return self.distribution.pdf(x, *self.params)

    def cdf(self, x: float | np.ndarray) -> float | np.ndarray:
        return self.distribution.cdf(x, *self.params)

    def survival_function(self, x: float | np.ndarray) -> float | np.ndarray:
        # Implementación numéricamente estable para cola derecha.
        return self.distribution.sf(x, *self.params)

    def parameter_dict(self) -> Dict[str, float]:
        shape_count = max(len(self.params) - 2, 0)
        param_map: Dict[str, float] = {}
        for idx in range(shape_count):
            param_map[f"shape_{idx + 1}"] = float(self.params[idx])
        if len(self.params) >= 2:
            param_map["loc"] = float(self.params[-2])
            param_map["scale"] = float(self.params[-1])
        return param_map

    def formatted_parameters(self) -> str:
        params = self.parameter_dict()
        return ", ".join(f"{key}={value:.6g}" for key, value in params.items())


SCIPY_DISTRIBUTIONS: List[Tuple[str, stats.rv_continuous]] = [
    ("Normal", stats.norm),
    ("Lognormal", stats.lognorm),
    ("Gamma", stats.gamma),
    ("WeibullMin", stats.weibull_min),
    ("WeibullMax", stats.weibull_max),
    ("Exponential", stats.expon),
    ("Beta", stats.beta),
    ("Logistic", stats.logistic),
    ("GumbelR", stats.gumbel_r),
    ("GumbelL", stats.gumbel_l),
    ("Pearson3", stats.pearson3),
    ("Triangular", stats.triang),
    ("Uniform", stats.uniform),
]


def load_dataset(path: str | Path, sheet_name: str = "Datos_Backstage") -> pd.DataFrame:
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"No existe el archivo de datos: {file_path}")

    if file_path.suffix.lower() in {".xlsx", ".xls"}:
        data = pd.read_excel(file_path, sheet_name=sheet_name, header=2)
    else:
        data = pd.read_csv(file_path)
        if "site_id" not in data.columns:
            data = pd.read_csv(file_path, header=2)

    data = data.loc[:, ~data.columns.astype(str).str.startswith("Unnamed")]
    data.columns = [str(column).strip() for column in data.columns]
    return data


def ecdf(sample: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    sorted_sample = np.sort(sample)
    n = sorted_sample.size
    y = np.arange(1, n + 1) / n
    return sorted_sample, y


def histogram_density(sample: np.ndarray, bins: int) -> Tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    density, bin_edges = np.histogram(sample, bins=bins, density=True)
    widths = np.diff(bin_edges)
    h_integral = float(np.sum(density * widths))
    return density, bin_edges, widths, h_integral


def numeric_pdf_integral(distribution: stats.rv_continuous, params: Tuple[float, ...], x_grid: np.ndarray) -> float:
    pdf_values = distribution.pdf(x_grid, *params)
    pdf_values = np.nan_to_num(pdf_values, nan=0.0, posinf=0.0, neginf=0.0)
    return float(np.trapezoid(pdf_values, x_grid))


def bhattacharyya_from_bins(
    density: np.ndarray,
    bin_edges: np.ndarray,
    widths: np.ndarray,
    distribution: stats.rv_continuous,
    params: Tuple[float, ...],
) -> Tuple[float, float]:
    p = np.clip(density * widths, EPS, None)
    p = p / p.sum()

    cdf_left = distribution.cdf(bin_edges[:-1], *params)
    cdf_right = distribution.cdf(bin_edges[1:], *params)
    q = np.clip(cdf_right - cdf_left, EPS, None)
    q = q / q.sum()

    bc = float(np.sum(np.sqrt(p * q)))
    db = float(-np.log(max(bc, EPS)))
    return bc, db


def ks_distance_explicit(sample: np.ndarray, distribution: stats.rv_continuous, params: Tuple[float, ...]) -> float:
    sorted_sample = np.sort(sample)
    n = sorted_sample.size
    model_cdf = distribution.cdf(sorted_sample, *params)
    i = np.arange(1, n + 1)
    d_plus = np.max(i / n - model_cdf)
    d_minus = np.max(model_cdf - (i - 1) / n)
    return float(max(d_plus, d_minus))


def evaluate_observation(value: float, fitted: FittedDistribution, thresholds: TailThresholds) -> Dict[str, float | str]:
    cdf_value = float(fitted.cdf(value))
    survival_value = float(fitted.survival_function(value))

    if cdf_value <= thresholds.left_tail:
        location = "left_tail"
    elif cdf_value >= thresholds.right_tail:
        location = "right_tail"
    else:
        location = "central"

    return {
        "value": float(value),
        "cdf": cdf_value,
        "survival_probability": survival_value,
        "percentile_probability": cdf_value,
        "upper_tail_probability": survival_value,
        "percentile": round(cdf_value * 100.0, 4),
        "location": location,
    }


def safe_fit(distribution: stats.rv_continuous, sample: np.ndarray) -> Tuple[float, ...] | None:
    try:
        params = distribution.fit(sample)
        if np.any(~np.isfinite(params)):
            return None
        return tuple(float(x) for x in params)
    except Exception:
        return None


def fit_distributions(sample: np.ndarray, bins: int, x_grid: np.ndarray) -> List[FittedDistribution]:
    density, bin_edges, widths, h_integral = histogram_density(sample, bins=bins)
    fitted: List[FittedDistribution] = []

    for name, distribution in SCIPY_DISTRIBUTIONS:
        params = safe_fit(distribution, sample)
        if params is None:
            continue

        ks_explicit = ks_distance_explicit(sample, distribution, params)
        ks_stat, _ = stats.kstest(sample, distribution.cdf, args=params)
        bc, db = bhattacharyya_from_bins(density, bin_edges, widths, distribution, params)
        f_integral = numeric_pdf_integral(distribution, params, x_grid)

        fitted.append(
            FittedDistribution(
                name=name,
                scipy_name=distribution.name,
                distribution=distribution,
                params=params,
                ks_distance=float(ks_explicit),
                ks_distance_scipy=float(ks_stat),
                bhattacharyya_distance=float(db),
                bhattacharyya_coefficient=float(bc),
                h_integral=h_integral,
                f_integral=f_integral,
                histogram_bins=bins,
            )
        )

    if not fitted:
        raise RuntimeError("No se pudo ajustar ninguna distribución.")

    return fitted


def infer_selection_thresholds(fitted: List[FittedDistribution], q: float) -> Dict[str, float]:
    ks_values = np.array([item.ks_distance for item in fitted], dtype=float)
    bh_values = np.array([item.bhattacharyya_distance for item in fitted], dtype=float)
    return {
        "quantile_q": float(q),
        "threshold_ks": float(np.quantile(ks_values, q)),
        "threshold_bhattacharyya": float(np.quantile(bh_values, q)),
    }


def build_results_table(fitted: List[FittedDistribution], thresholds: Dict[str, float]) -> pd.DataFrame:
    rows = []
    for item in fitted:
        is_candidate = (
            item.ks_distance <= thresholds["threshold_ks"]
            and item.bhattacharyya_distance <= thresholds["threshold_bhattacharyya"]
        )
        rows.append(
            {
                "distribution": item.name,
                "scipy_distribution": item.scipy_name,
                "parameters": item.formatted_parameters(),
                "ks": item.ks_distance,
                "ks_scipy": item.ks_distance_scipy,
                "bhattacharyya": item.bhattacharyya_distance,
                "bhattacharyya_coefficient": item.bhattacharyya_coefficient,
                "h_integral": item.h_integral,
                "f_integral": item.f_integral,
                "candidate": is_candidate,
            }
        )

    df = pd.DataFrame(rows)
    df["rank_ks"] = df["ks"].rank(method="dense", ascending=True)
    df["rank_bhattacharyya"] = df["bhattacharyya"].rank(method="dense", ascending=True)
    df["rank_total"] = df["rank_ks"] + df["rank_bhattacharyya"]
    df = df.sort_values(["rank_total", "bhattacharyya", "ks"]).reset_index(drop=True)

    best_distribution = df.loc[0, "distribution"]
    df["selection"] = np.where(df["distribution"] == best_distribution, "BEST", np.where(df["candidate"], "CANDIDATE", "REJECTED"))
    return df


def plot_histogram_unit(sample: np.ndarray, bins: int, output_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(11, 6))
    ax.hist(sample, bins=bins, density=True, alpha=0.65, color="#2a6fdb", edgecolor="white")
    ax.set_title("Gráfico 1 — Histograma unitario h(x)")
    ax.set_xlabel("x")
    ax.set_ylabel("densidad")
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def plot_all_distributions(sample: np.ndarray, fitted: List[FittedDistribution], x_grid: np.ndarray, bins: int, output_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(12, 7))
    ax.hist(sample, bins=bins, density=True, alpha=0.25, color="#94a3b8", edgecolor="white", label="h(x)")
    for item in fitted:
        ax.plot(x_grid, item.pdf(x_grid), linewidth=1.2, label=item.name)
    ax.set_title("Gráfico 2 — N distribuciones probadas sobre h(x)")
    ax.set_xlabel("x")
    ax.set_ylabel("densidad")
    ax.legend(ncol=3, fontsize=8)
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def plot_top_pdfs(sample: np.ndarray, fitted: List[FittedDistribution], x_grid: np.ndarray, bins: int, output_path: Path, top_n: int = 5) -> None:
    ranked = sorted(fitted, key=lambda item: (item.ks_distance + item.bhattacharyya_distance, item.bhattacharyya_distance, item.ks_distance))[:top_n]
    fig, ax = plt.subplots(figsize=(12, 7))
    ax.hist(sample, bins=bins, density=True, alpha=0.22, color="#94a3b8", edgecolor="white", label="h(x)")
    for item in ranked:
        ax.plot(x_grid, item.pdf(x_grid), linewidth=2, label=item.name)
    ax.set_title(f"Gráfico 3 — Mejores {len(ranked)} PDFs superpuestas")
    ax.set_xlabel("x")
    ax.set_ylabel("densidad")
    ax.legend()
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def plot_best_vs_hist(sample: np.ndarray, best: FittedDistribution, x_grid: np.ndarray, bins: int, output_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(12, 7))
    ax.hist(sample, bins=bins, density=True, alpha=0.32, color="#3b82f6", edgecolor="white", label="h(x) unitario")
    ax.plot(x_grid, best.pdf(x_grid), color="#ef4444", linewidth=2.2, label=f"f*(x): {best.name}")
    ax.set_title("Gráfico 4 — Superposición correcta h(x) vs f(x)")
    ax.set_xlabel("x")
    ax.set_ylabel("densidad")
    ax.legend()
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def plot_ecdf_vs_cdf(sample: np.ndarray, best: FittedDistribution, output_path: Path) -> None:
    x_ecdf, y_ecdf = ecdf(sample)
    y_cdf = best.cdf(x_ecdf)

    fig, ax = plt.subplots(figsize=(11, 6))
    ax.step(x_ecdf, y_ecdf, where="post", label="ECDF empírica", linewidth=2)
    ax.plot(x_ecdf, y_cdf, color="#ef4444", linewidth=2, label=f"CDF teórica ({best.name})")
    ax.set_title("Gráfico 5 — ECDF vs CDF")
    ax.set_xlabel("x")
    ax.set_ylabel("probabilidad acumulada")
    ax.legend()
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def plot_cdf_survival(best: FittedDistribution, sample: np.ndarray, x_selected: float, output_path: Path) -> Dict[str, float]:
    lower = float(np.min(sample))
    upper = float(np.max(sample))
    x_grid = np.linspace(lower, upper, 800)
    cdf_values = best.cdf(x_grid)
    sf_values = best.survival_function(x_grid)

    fx = float(best.cdf(x_selected))
    sfx = float(best.survival_function(x_selected))

    fig, ax = plt.subplots(figsize=(12, 7))
    ax.plot(x_grid, cdf_values, linewidth=2.2, color="#2563eb", label="CDF teórica F(x)")
    ax.plot(x_grid, sf_values, linewidth=2.2, color="#f97316", label="Survival 1-F(x)")
    ax.axvline(x_selected, color="#9ca3af", linestyle="--", linewidth=1.3, label=f"x seleccionado = {x_selected:.4g}")
    ax.scatter([x_selected], [fx], color="#2563eb", zorder=5)
    ax.scatter([x_selected], [sfx], color="#f97316", zorder=5)
    ax.annotate(f"F(x)={fx:.4f}", (x_selected, fx), xytext=(8, 10), textcoords="offset points")
    ax.annotate(f"1-F(x)={sfx:.4f}", (x_selected, sfx), xytext=(8, -18), textcoords="offset points")
    ax.set_title("Gráfico 9 — CDF y Survival Function")
    ax.set_xlabel("x")
    ax.set_ylabel("probabilidad")
    ax.set_ylim(-0.02, 1.02)
    ax.legend()
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)
    return {"cdf": fx, "survival_probability": sfx}


def plot_metric_ranking(df: pd.DataFrame, metric_col: str, title: str, output_path: Path) -> None:
    ranking = df.sort_values(metric_col).reset_index(drop=True)
    fig, ax = plt.subplots(figsize=(12, 6))
    ax.bar(ranking["distribution"], ranking[metric_col], color="#3b82f6")
    ax.set_title(title)
    ax.set_xlabel("Distribución")
    ax.set_ylabel(metric_col)
    ax.tick_params(axis="x", rotation=45)
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def plot_metric_threshold_distribution(
    df: pd.DataFrame,
    metric_col: str,
    threshold_value: float,
    output_path: Path,
    title: str,
) -> None:
    values = df[metric_col].to_numpy(dtype=float)
    bins = max(6, min(20, len(values) // 2))

    fig, ax = plt.subplots(figsize=(11, 6))
    counts, edges, _ = ax.hist(values, bins=bins, color="#93c5fd", edgecolor="white", alpha=0.85, label=f"Distribución de {metric_col}")
    ax.axvline(threshold_value, color="#dc2626", linestyle="--", linewidth=2, label=f"Umbral q={threshold_value:.4g}")
    ax.axvspan(min(values), threshold_value, color="#fde68a", alpha=0.25, label="Cola izquierda (candidatas)")

    candidates = df[df[metric_col] <= threshold_value]
    if not candidates.empty:
        y_level = max(counts) * 0.95 if len(counts) > 0 else 0.1
        for _, row in candidates.iterrows():
            ax.scatter(row[metric_col], y_level, color="#0f766e", zorder=4)
            ax.annotate(row["distribution"], (row[metric_col], y_level), xytext=(4, 4), textcoords="offset points", fontsize=8)

    ax.set_title(title)
    ax.set_xlabel(metric_col)
    ax.set_ylabel("frecuencia")
    ax.legend()
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def plot_metrics_table(df: pd.DataFrame, output_path: Path) -> None:
    columns = ["distribution", "parameters", "ks", "bhattacharyya", "selection"]
    table_data = df[columns].copy()
    table_data["ks"] = table_data["ks"].map(lambda value: f"{value:.6f}")
    table_data["bhattacharyya"] = table_data["bhattacharyya"].map(lambda value: f"{value:.6f}")

    fig, ax = plt.subplots(figsize=(16, max(4, 0.35 * len(table_data))))
    ax.axis("off")
    table = ax.table(
        cellText=table_data.values,
        colLabels=["f(x)", "parámetros", "KS", "Bhattacharyya", "selección"],
        cellLoc="left",
        colLoc="left",
        loc="center",
    )
    table.auto_set_font_size(False)
    table.set_fontsize(8)
    table.scale(1, 1.4)
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def run_full_analysis(
    sample: np.ndarray,
    output_dir: Path,
    x_selected: float,
    bins: int,
    threshold_q: float,
    tail_thresholds: TailThresholds,
) -> Dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)
    margin = 0.05 * (np.max(sample) - np.min(sample) + EPS)
    x_grid = np.linspace(np.min(sample) - margin, np.max(sample) + margin, 2000)

    fitted = fit_distributions(sample, bins=bins, x_grid=x_grid)
    thresholds = infer_selection_thresholds(fitted, q=threshold_q)
    results_df = build_results_table(fitted, thresholds)

    best_name = results_df.iloc[0]["distribution"]
    best = next(item for item in fitted if item.name == best_name)

    observation = evaluate_observation(x_selected, best, tail_thresholds)
    cdf_sf = plot_cdf_survival(best, sample, x_selected, output_dir / "cdf_survival.png")
    observation["cdf"] = cdf_sf["cdf"]
    observation["survival_probability"] = cdf_sf["survival_probability"]
    observation["upper_tail_probability"] = cdf_sf["survival_probability"]
    observation["percentile_probability"] = cdf_sf["cdf"]
    observation["percentile"] = round(cdf_sf["cdf"] * 100.0, 4)

    plot_histogram_unit(sample, bins, output_dir / "histogram_unit.png")
    plot_all_distributions(sample, fitted, x_grid, bins, output_dir / "all_distributions_pdf.png")
    plot_top_pdfs(sample, fitted, x_grid, bins, output_dir / "top_pdfs_overlay.png")
    plot_best_vs_hist(sample, best, x_grid, bins, output_dir / "best_pdf_vs_hist.png")
    plot_ecdf_vs_cdf(sample, best, output_dir / "ecdf_vs_best_cdf.png")
    plot_metric_ranking(results_df, "bhattacharyya", "Gráfico 7 — Ranking Bhattacharyya (menor es mejor)", output_dir / "bhattacharyya_ranking.png")
    plot_metric_ranking(results_df, "ks", "Gráfico 8 — Ranking KS (menor es mejor)", output_dir / "ks_ranking.png")
    plot_metric_threshold_distribution(
        results_df,
        "bhattacharyya",
        thresholds["threshold_bhattacharyya"],
        output_dir / "bhattacharyya_threshold.png",
        "Gráfico 10 — Distribución de distancias Bhattacharyya + umbral",
    )
    plot_metric_threshold_distribution(
        results_df,
        "ks",
        thresholds["threshold_ks"],
        output_dir / "ks_threshold.png",
        "Gráfico 11 — Distribución de estadísticas KS + umbral",
    )
    plot_metrics_table(results_df, output_dir / "metrics_table.png")

    results_df.to_csv(output_dir / "results.csv", index=False)
    academic_summary = results_df[["distribution", "parameters", "ks", "bhattacharyya", "selection"]].copy()
    academic_summary.to_csv(output_dir / "academic_summary.csv", index=False)

    summary = {
        "thresholds": thresholds,
        "tail_thresholds": {
            "left_tail": tail_thresholds.left_tail,
            "right_tail": tail_thresholds.right_tail,
        },
        "observation_evaluation": observation,
        "selected_distribution": best.name,
        "selected_distribution_parameters": best.parameter_dict(),
        "integral_validation": {
            "h_integral": best.h_integral,
            "f_integral": best.f_integral,
        },
        "heuristic_note": (
            "La selección por umbrales de cuantiles sobre KS/Bhattacharyya es una heurística experimental "
            "del proyecto para clasificación/ranking de modelos, no una prueba universal."
        ),
    }
    pd.Series(summary).to_json(output_dir / "analysis_summary.json", force_ascii=False, indent=2)
    return summary
