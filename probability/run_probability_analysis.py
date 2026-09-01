from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from statistical_engine import TailThresholds, load_dataset, run_full_analysis


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="BACKSTAGE - Análisis probabilístico académico con ajuste de distribuciones."
    )
    parser.add_argument(
        "--input",
        default="Backstage_Dataset_Probabilistico.csv",
        help="Ruta del dataset fuente (.csv o .xlsx).",
    )
    parser.add_argument(
        "--sheet",
        default="Datos_Backstage",
        help="Nombre de hoja para Excel.",
    )
    parser.add_argument(
        "--variable",
        default="commercial_rent_cop_m2",
        help="Variable numérica a analizar.",
    )
    parser.add_argument(
        "--x-value",
        type=float,
        default=None,
        help="Valor observado x para evaluar CDF y 1-CDF. Si se omite, usa la mediana.",
    )
    parser.add_argument("--bins", type=int, default=30, help="Número de bins del histograma unitario.")
    parser.add_argument(
        "--threshold-quantile",
        type=float,
        default=0.20,
        help="Cuantil q para umbral experimental de selección por distancias.",
    )
    parser.add_argument(
        "--left-tail",
        type=float,
        default=0.05,
        help="Umbral configurable de cola izquierda: F(x) <= left_tail.",
    )
    parser.add_argument(
        "--right-tail",
        type=float,
        default=0.95,
        help="Umbral configurable de cola derecha: F(x) >= right_tail.",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Carpeta de salida. Si se omite usa probability/output/<variable>.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not 0 < args.left_tail < args.right_tail < 1:
        raise ValueError("Los umbrales deben cumplir 0 < left_tail < right_tail < 1.")
    if not 0 < args.threshold_quantile < 1:
        raise ValueError("threshold-quantile debe estar entre 0 y 1.")

    dataset = load_dataset(args.input, sheet_name=args.sheet)
    if args.variable not in dataset.columns:
        raise KeyError(f"La variable '{args.variable}' no existe en el dataset.")

    series = np.array(dataset[args.variable].dropna(), dtype=float)
    if series.size < 30:
        raise ValueError("Se requieren al menos 30 observaciones numéricas para un ajuste estable.")

    x_selected = float(np.median(series)) if args.x_value is None else float(args.x_value)
    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        output_dir = Path("output") / args.variable

    summary = run_full_analysis(
        sample=series,
        output_dir=output_dir,
        x_selected=x_selected,
        bins=args.bins,
        threshold_q=args.threshold_quantile,
        tail_thresholds=TailThresholds(left_tail=args.left_tail, right_tail=args.right_tail),
    )

    print("==============================================")
    print("BACKSTAGE - ANÁLISIS PROBABILÍSTICO COMPLETADO")
    print("==============================================")
    print(f"Variable analizada: {args.variable}")
    print(f"Distribución seleccionada f*(x): {summary['selected_distribution']}")
    print(f"Carpeta de salida: {output_dir.resolve()}")
    print(f"Integral h(x) dx ~ {summary['integral_validation']['h_integral']:.6f}")
    print(f"Integral f(x) dx ~ {summary['integral_validation']['f_integral']:.6f}")
    print("Evaluación de observación:")
    observation = summary["observation_evaluation"]
    print(f"  x = {observation['value']:.6g}")
    print(f"  F(x) = P(X<=x) = {observation['cdf']:.6f}")
    print(f"  1-F(x) = P(X>x) = {observation['survival_probability']:.6f}")
    print(f"  Percentil ~ {observation['percentile']:.3f}")
    print(f"  Ubicación probabilística = {observation['location']}")
    print("Nota: la selección por umbral es heurística experimental (no prueba universal).")


if __name__ == "__main__":
    main()
