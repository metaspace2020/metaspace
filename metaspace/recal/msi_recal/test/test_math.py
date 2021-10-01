from msi_recal.math import ppm_to_sigma_1

# This file is WIP


def test_ppm_to_sigma_1_tof():
    assert ppm_to_sigma_1(1, "tof", 1) == 1e-6
    assert ppm_to_sigma_1(2, "tof", 1) == 2e-6
    assert ppm_to_sigma_1(2, "tof", 4) == 2.5e-7


def test_ppm_to_sigma_1_orbitrap():
    assert ppm_to_sigma_1(1, "orbitrap", 200) == 2e-6
    assert ppm_to_sigma_1(2, "orbitrap", 200) == 4e-6
    assert ppm_to_sigma_1(2, "orbitrap", 100) == 2e-6


def test_ppm_to_sigma_1_fticr():
    assert ppm_to_sigma_1(1, "ft-icr", 200) == 2e-6
    assert ppm_to_sigma_1(2, "ft-icr", 200) == 4e-6
    assert ppm_to_sigma_1(2, "ft-icr", 100) == 2e-6
