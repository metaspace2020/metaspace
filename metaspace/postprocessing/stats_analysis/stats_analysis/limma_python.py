"""Pure-Python reimplementation of limma's GLS + empirical Bayes pipeline."""
# pylint: disable=invalid-name  # short linear-model notation (Y, X, W, V, beta) is conventional
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import linalg as _linalg
from scipy import optimize as _optimize
from scipy import special as _special
from scipy import stats as _stats
from scipy.stats import trim_mean as _trim_mean
from statsmodels.stats.multitest import multipletests


@dataclass
class FeatureClassification:
    tier1_idx: np.ndarray  # (n_tier1,)    int
    tier2_idx: np.ndarray  # (n_tier2,)    int
    feat_means: np.ndarray  # (n_features,) float64
    feat_cv: np.ndarray  # (n_features,) float64
    intensity_threshold: float


@dataclass
class GlsFitResult:
    beta: np.ndarray  # (n_params, n_features) float64
    sigma2: np.ndarray  # (n_features,)          float64
    df_res: int
    XtX_inv: np.ndarray  # (n_params, n_params)   float64


@dataclass
class EBPrior:
    s2_prior: float
    df_prior: float
    df_res: int


@dataclass
class ModeratedVariance:
    s2_post: np.ndarray  # (n_features,) float64
    df_total: float


@dataclass
class TestResult:
    log2FC: np.ndarray  # (n_contrasts, n_features)
    t_stat: np.ndarray  # (n_contrasts, n_features)
    pvalue: np.ndarray  # (n_contrasts, n_features)
    adj_pvalue: np.ndarray  # (n_contrasts, n_features)


@dataclass
class LimmaResult:  # pylint: disable=too-many-instance-attributes
    log2FC: np.ndarray  # (n_contrasts, n_features)
    t_stat: np.ndarray  # (n_contrasts, n_features)
    pvalue: np.ndarray  # (n_contrasts, n_features)
    adj_pvalue: np.ndarray  # (n_contrasts, n_features)
    f_stat: np.ndarray  # (n_features,) omnibus F across all contrasts
    f_pvalue: np.ndarray  # (n_features,)
    adj_f_pvalue: np.ndarray  # (n_features,) BH-adjusted
    s2_post: np.ndarray  # (n_features,)
    rho: float
    s2_prior: float
    df_prior: float
    df_res: int
    tier1_idx: np.ndarray  # (n_tier1,)
    tier2_idx: np.ndarray  # (n_tier2,)
    feat_means: np.ndarray  # (n_features,)
    feat_cv: np.ndarray  # (n_features,)


def classify_features(
    Y: np.ndarray,
    intensity_percentile: float = 0.15,
    cv_threshold: float = 0.8,
) -> FeatureClassification:
    """Partition features into Tier 1 (high-intensity, low-CV) and Tier 2.

    Tier 1 features drive prior estimation; all features are tested.
    Raises ValueError if no features pass Tier 1.
    """
    feat_means = Y.mean(axis=1)
    feat_sd = Y.std(axis=1, ddof=1)
    feat_cv = feat_sd / (feat_means + 1e-6)

    intensity_threshold = float(np.percentile(feat_means, intensity_percentile * 100))
    tier1_mask = (feat_means >= intensity_threshold) & (feat_cv <= cv_threshold)
    tier1_idx = np.where(tier1_mask)[0]
    tier2_idx = np.where(~tier1_mask)[0]

    if tier1_idx.size == 0:
        raise ValueError(
            'No features pass the Tier 1 filter '
            f'(intensity_percentile={intensity_percentile}, cv_threshold={cv_threshold}). '
            'Relax the thresholds or inspect the input matrix.'
        )

    return FeatureClassification(
        tier1_idx=tier1_idx,
        tier2_idx=tier2_idx,
        feat_means=feat_means,
        feat_cv=feat_cv,
        intensity_threshold=intensity_threshold,
    )


def duplicate_correlation(  # pylint: disable=too-many-locals
    Y: np.ndarray,
    X: np.ndarray,
    block_ids,
) -> float:
    """Estimate a consensus intraclass correlation rho via ANOVA on OLS residuals.

    Matches R's statmod::mixedModel2 / limma::duplicateCorrelation.
    Returns 0.0 if every block is a singleton or df are insufficient.
    """
    beta_ols, _, _, _ = _linalg.lstsq(X, Y.T)
    residuals = Y.T - X @ beta_ols  # (n_samples, n_features)

    block_arr = np.asarray(block_ids)
    unique_blocks = np.unique(block_arr)
    n_features = Y.shape[0]
    N = residuals.shape[0]
    rank_X = int(np.linalg.matrix_rank(X))

    SS_between = np.zeros(n_features, dtype=np.float64)
    SS_within = np.zeros(n_features, dtype=np.float64)
    B = len(unique_blocks)
    k_multi = []  # sizes of blocks with ≥ 2 members

    for b in unique_blocks:
        idx = np.where(block_arr == b)[0]
        k = idx.size
        block_res = residuals[idx, :]
        block_mean = block_res.mean(axis=0)
        SS_between += k * (block_mean ** 2)
        SS_within += ((block_res - block_mean) ** 2).sum(axis=0)
        if k >= 2:
            k_multi.append(k)

    if not k_multi:
        return 0.0

    # df via rank([X|Z]): handles nested vs. crossed/paired designs correctly.
    Z_mat = np.zeros((N, B), dtype=np.float64)
    for _bi, _b in enumerate(unique_blocks):
        Z_mat[block_arr == _b, _bi] = 1.0
    rank_XZ = int(np.linalg.matrix_rank(np.hstack([X, Z_mat])))
    df_between = rank_XZ - rank_X
    df_within = N - rank_XZ
    if df_between <= 0 or df_within <= 0:
        return 0.0

    # Effective block size for unbalanced designs (Searle 1971).
    k_arr = np.array(k_multi, dtype=np.float64)
    n_multi_total = float(k_arr.sum())
    n_multi_blocks = len(k_multi)
    k0 = (
        (n_multi_total - np.sum(k_arr ** 2) / n_multi_total) / (n_multi_blocks - 1)
        if n_multi_blocks > 1
        else float(k_arr[0])
    )

    MS_between = SS_between / df_between
    MS_within = SS_within / df_within

    denom = MS_between + (k0 - 1.0) * MS_within
    valid = denom > 0
    icc = np.where(valid, (MS_between - MS_within) / denom, 0.0)
    icc = np.clip(icc, 0.0, 1.0 - 1e-10)

    z = np.arctanh(icc)
    rho = float(np.tanh(_trim_mean(z, 0.15)))
    return rho


def gls_fit(
    Y: np.ndarray,
    X: np.ndarray,
    rho: float,
    block_ids,
) -> GlsFitResult:
    """GLS via Cholesky whitening: build block covariance V, whiten, fit OLS."""
    n_samples = X.shape[0]
    block_arr = np.asarray(block_ids)

    same_block = (block_arr[:, None] == block_arr[None, :]).astype(np.float64)
    np.fill_diagonal(same_block, 0.0)
    V = np.eye(n_samples, dtype=np.float64) + rho * same_block

    V_inv = _linalg.inv(V)
    W = _linalg.cholesky(V_inv, lower=False)
    X_w = W @ X
    Y_w = (W @ Y.T).T

    beta, _, _, _ = _linalg.lstsq(X_w, Y_w.T)  # (n_params, n_features)
    fitted = X_w @ beta
    residuals = Y_w.T - fitted

    df_res = int(n_samples - np.linalg.matrix_rank(X_w))
    sigma2 = np.sum(residuals ** 2, axis=0) / df_res
    XtX_inv = _linalg.inv(X_w.T @ X_w)

    return GlsFitResult(beta=beta, sigma2=sigma2, df_res=df_res, XtX_inv=XtX_inv)


def estimate_prior(
    sigma2: np.ndarray,
    classification: FeatureClassification,
    df_res: int,
    robust: bool = False,
) -> EBPrior:
    """Fit scaled inverse-chi-squared prior by moment matching on Tier 1 log-variances.

    Implements Smyth 2004 / R's fitFDist.
    robust=True Winsorises at [5th, 95th] percentile before moment matching.
    """
    s2_t1 = sigma2[classification.tier1_idx]
    s2_t1 = np.maximum(s2_t1, np.finfo(np.float64).tiny)
    s = np.log(s2_t1).astype(np.float64)

    if robust:
        lo, hi = np.percentile(s, [5.0, 95.0])
        s = np.clip(s, lo, hi)

    dig = float(_special.digamma(df_res / 2.0))
    trig = float(_special.polygamma(1, df_res / 2.0))

    m = float(np.mean(s - dig + np.log(df_res / 2.0)))
    v = (float(np.var(s, ddof=1)) - trig) if len(s) >= 2 else 0.0

    if v <= 0:
        # Sampling noise alone explains observed variance; use infinite shrinkage.
        df_prior = 1e6
    else:

        def _trigamma_eq(d0: float) -> float:
            return float(_special.polygamma(1, d0 / 2.0)) - v

        df_prior = float(_optimize.brentq(_trigamma_eq, 1e-6, 1e5))

    s2_prior = float(np.exp(m + _special.digamma(df_prior / 2.0) - np.log(df_prior / 2.0)))

    return EBPrior(s2_prior=s2_prior, df_prior=df_prior, df_res=df_res)


def ebayes_moderate(
    sigma2: np.ndarray,
    prior: EBPrior,
) -> ModeratedVariance:
    """Shrink per-feature variances toward the EB prior.

    s2_post = (df_prior * s2_prior + df_res * sigma2) / (df_prior + df_res)
    """
    s2_post = (prior.df_prior * prior.s2_prior + prior.df_res * sigma2) / (
        prior.df_prior + prior.df_res
    )
    df_total = float(prior.df_prior + prior.df_res)
    return ModeratedVariance(s2_post=s2_post, df_total=df_total)


def moderated_ttest(
    beta: np.ndarray,
    contrasts: np.ndarray,
    XtX_inv: np.ndarray,
    moderated: ModeratedVariance,
) -> TestResult:
    """Moderated t-test for all contrasts with BH FDR correction per contrast."""
    log2FC = contrasts @ beta
    contrast_var = np.diag(contrasts @ XtX_inv @ contrasts.T)
    var_fc = moderated.s2_post[None, :] * contrast_var[:, None]

    t_stat = log2FC / np.sqrt(var_fc)
    pvalue = 2.0 * _stats.t.sf(np.abs(t_stat), df=moderated.df_total)

    n_contrasts = contrasts.shape[0]
    adj_pvalue = np.empty_like(pvalue)
    for i in range(n_contrasts):
        adj_pvalue[i] = multipletests(pvalue[i], method='fdr_bh')[1]

    return TestResult(log2FC=log2FC, t_stat=t_stat, pvalue=pvalue, adj_pvalue=adj_pvalue)


def run_limma(  # pylint: disable=too-many-locals
    Y: np.ndarray,
    X: np.ndarray,
    block_ids,
    contrasts: np.ndarray,
    intensity_percentile: float = 0.15,
    cv_threshold: float = 0.8,
    robust: bool = False,
) -> LimmaResult:
    """Run the full GLS + empirical Bayes limma pipeline.

    Y: (n_features, n_samples) log2-transformed intensities, no missing values.
    X: (n_samples, n_params) design matrix, must be full rank.
    block_ids: (n_samples,) biological block identifiers.
    contrasts: (n_contrasts, n_params) or (n_params,) — 1-D is auto-promoted.
    Returns LimmaResult with test arrays of shape (n_contrasts, n_features).
    """
    Y = np.asarray(Y, dtype=np.float64)
    X = np.asarray(X, dtype=np.float64)
    contrasts = np.asarray(contrasts, dtype=np.float64)
    if contrasts.ndim == 1:
        contrasts = contrasts[None, :]

    classification = classify_features(Y, intensity_percentile, cv_threshold)
    # rho estimated on Tier 1 only — noisy Tier 2 residuals would bias the ICC.
    rho = duplicate_correlation(Y[classification.tier1_idx, :], X, block_ids)
    fit = gls_fit(Y, X, rho, block_ids)
    prior = estimate_prior(fit.sigma2, classification, fit.df_res, robust=robust)
    moderated = ebayes_moderate(fit.sigma2, prior)
    test = moderated_ttest(fit.beta, contrasts, fit.XtX_inv, moderated)

    n_coef = X.shape[1] - 1
    if n_coef >= 1:
        b = fit.beta[1:, :]
        M_inv = _linalg.inv(fit.XtX_inv[1:, 1:])
        tmp = M_inv @ b
        numerator = np.sum(b * tmp, axis=0)
        f_stat = np.maximum(numerator / (n_coef * moderated.s2_post), 0.0)
    else:
        f_stat = np.zeros(Y.shape[0], dtype=np.float64)
    f_pvalue = _stats.f.sf(f_stat, dfn=max(1, n_coef), dfd=moderated.df_total)
    adj_f_pvalue = multipletests(f_pvalue, method='fdr_bh')[1]

    return LimmaResult(
        log2FC=test.log2FC,
        t_stat=test.t_stat,
        pvalue=test.pvalue,
        adj_pvalue=test.adj_pvalue,
        f_stat=f_stat,
        f_pvalue=f_pvalue,
        adj_f_pvalue=adj_f_pvalue,
        s2_post=moderated.s2_post,
        rho=rho,
        s2_prior=prior.s2_prior,
        df_prior=prior.df_prior,
        df_res=fit.df_res,
        tier1_idx=classification.tier1_idx,
        tier2_idx=classification.tier2_idx,
        feat_means=classification.feat_means,
        feat_cv=classification.feat_cv,
    )
