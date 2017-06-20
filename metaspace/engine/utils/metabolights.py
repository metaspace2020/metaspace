from __future__ import print_function, division
import json
from datetime import datetime
from ftplib import FTP
import os.path

from sm.engine.queue import QueuePublisher
from sm.engine.util import SMConfig

import isatools.io.isatab_parser as ip
import boto3

def setupQueue(sm_config_path):
    SMConfig.set_path(sm_config_path)
    rabbitmq_config = SMConfig.get_conf()['rabbitmq']
    return QueuePublisher(rabbitmq_config, 'sm_annotate')

RESOL_POWER_PARAMS = {
    '70K': {'sigma': 0.00247585727028, 'fwhm': 0.00583019832869, 'pts_per_mz': 2019},
    '100K': {'sigma': 0.0017331000892, 'fwhm': 0.00408113883008, 'pts_per_mz': 2885},
    '140K': {'sigma': 0.00123792863514, 'fwhm': 0.00291509916435, 'pts_per_mz': 4039},
    '200K': {'sigma': 0.000866550044598, 'fwhm': 0.00204056941504, 'pts_per_mz': 5770},
    '250K': {'sigma': 0.000693240035678, 'fwhm': 0.00163245553203, 'pts_per_mz': 7212},
    '280K': {'sigma': 0.00061896431757, 'fwhm': 0.00145754958217, 'pts_per_mz': 8078},
    '500K': {'sigma': 0.000346620017839, 'fwhm': 0.000816227766017, 'pts_per_mz': 14425},
    '750K': {'sigma': 0.000231080011893, 'fwhm': 0.000544151844011, 'pts_per_mz': 21637},
    '1000K': {'sigma': 0.00017331000892, 'fwhm': 0.000408113883008, 'pts_per_mz': 28850},
}

def sm_engine_config(meta_json, mass_accuracy_ppm=2):
    polarity_dict = {'Positive': '+', 'Negative': '-'}
    polarity = polarity_dict[meta_json['MS_Analysis']['Polarity']]
    instrument = meta_json['MS_Analysis']['Analyzer']
    rp = meta_json['MS_Analysis']['Detector_Resolving_Power']
    rp_mz = float(rp['mz'])
    rp_resolution = float(rp['Resolving_Power'])

    if instrument.lower() == 'fticr':
        rp200 = rp_resolution * rp_mz / 200.0
    elif instrument.lower() == 'orbitrap':
        rp200 = rp_resolution * (rp_mz / 200.0) ** 0.5
    else:
        rp200 = rp_resolution

    rp_options = sorted([int(x[:-1]) * 1000 for x in RESOL_POWER_PARAMS.keys()])
    from bisect import bisect_left
    idx = bisect_left(rp_options, rp200)
    if idx == len(rp_options):
        idx = -1
    elif idx > 0:
        middle = (rp_options[idx] + rp_options[idx - 1]) / 2
        if rp200 < middle:
            idx -= 1

    params = RESOL_POWER_PARAMS[str(rp_options[idx] // 1000) + "K"]

    return {
        "database": {
            "name": meta_json['metaspace_options']['Metabolite_Database']
        },
        "isotope_generation": {
            "adducts": {'+': ['+H', '+K', '+Na'], '-': ['-H', '+Cl']}[polarity],
            "charge": {
                "polarity": polarity,
                "n_charges": 1
            },
            "isocalc_sigma": round(params['sigma'], 6),
            "isocalc_pts_per_mz": params['pts_per_mz']
        },
        "image_generation": {
            "ppm": float(mass_accuracy_ppm),
            "nlevels": 30,
            "q": 99,
            "do_preprocessing": False
        }
    }

class BatchConfig(object):
    def __init__(self, study_id, metadata_template):
        self.study_id = study_id
        self.metadata_template = metadata_template

class MetabolightsBatch(object):
    def __init__(self, batch_config, tmp_dir="/tmp", s3bucket='sm-engine-icl-data',
                 parse_isatab=True):
        """
        tmp_dir: temporary directory for downloads
        study_id: numeric ID of the study
        s3bucket: where to put imzML/ibd and metadata JSONs
        parse_isatab: whether to parse IsaTAB or not
                      (if not, metadata must be the same for all datasets and provided in the template)
        """
        self._tmp_dir = tmp_dir

        self._study_id = str(batch_config.study_id)
        self._metadata_template = batch_config.metadata_template
        self._institution = self._metadata_template['Submitted_By']['Institution']

        self._study_rel_dir = "MTBLS" + self._study_id
        self._study_dir = os.path.join(self._tmp_dir, self._study_rel_dir)
        if not os.path.exists(self._study_dir):
            os.mkdir(self._study_dir)

        self._s3 = boto3.session.Session().resource('s3')
        self._bucket = self._s3.Bucket(s3bucket)

        self._parse_isatab = parse_isatab

        self._copyFiles()

    def _extractStudyMetadata(self, study):
        result = {}

        for imzml in study.assays[0].nodes.values():
            filename = imzml.metadata['Derived Data File'][0]

            result[filename] = {
                'analyzer': imzml.metadata['Parameter Value[Mass analyzer]'][0].Mass_analyzer,
                'ionisation_source': imzml.metadata['Parameter Value[Ion source]'][0].Ion_source,
                'polarity': imzml.metadata['Parameter Value[Scan polarity]'][0].Scan_polarity,
                'sample_stabilisation': imzml.metadata['Parameter Value[Sample preservation]'][0].Sample_preservation,
                'doi': study.publications[0]['Study Publication DOI']
            }

        return result

    def _centroidedDatasets(self, filenames):
        """
        filenames: list of files in the study FTP directory
        Returns: list of pairs (imzml filename, ibd filename)
        """
        imzml_filenames = [fn for fn in filenames if fn.lower().endswith("imzml")]
        filenames = set(filenames)
        targets = []
        for imzml_fn in imzml_filenames:
            if 'profile' in imzml_fn:
                continue  # skip non-centroided data
            ibd_fn = imzml_fn[:-5] + "ibd"
            if ibd_fn not in filenames:
                print("skipping", imzml_fn, "because .ibd file is not found")
                continue
            if self._parse_isatab and (imzml_fn not in self._info):
                # attempt to find metadata for profile data
                profile_imzml_fn = imzml_fn.replace("centroid", "profile")
                if profile_imzml_fn in self._info:
                    self._info[imzml_fn] = self._info[profile_imzml_fn]
                else:
                    print("skipping", imzml_fn, "because no associated metadata was found")
                    continue
            targets.append((imzml_fn, ibd_fn))
        return targets

    def _ftpConnection(self):
        ftp = FTP("ftp.ebi.ac.uk")
        ftp.login()
        ftp.cwd("pub/databases/metabolights/studies/public/" + self._study_rel_dir)
        return ftp

    def _fetchFromFTP(self, filename, mode="wb+"):
        local_fn = os.path.join(self._study_dir, filename)
        if os.path.exists(local_fn):
            return local_fn
        try:
            with open(local_fn, mode) as out:
                self._ftp.retrbinary("RETR " + filename, out.write)
            return local_fn
        except Exception:
            os.remove(local_fn)
            return None

    def _s3dir(self, imzml):
        return self._study_rel_dir + "/" + imzml[:-6]

    def _shorten(self, long_name):
        d = {
            'desorption electrospray ionization': 'DESI',
            'electrospray ionization': 'DESI'
        }
        if long_name in d:
            return d[long_name]
        return long_name

    def _uploadMetadata(self, imzml_fn, ds_name):
        metadata = self._metadata_template
        metadata['metaspace_options']['Dataset_Name'] = ds_name
        if self._parse_isatab:
            info = self._info[imzml_fn]
            metadata['MS_Analysis']['Analyzer'] = info['analyzer'].capitalize()
            metadata['MS_Analysis']['Polarity'] = info['polarity'].capitalize()
            metadata['MS_Analysis']['Ionisation_Source'] = self._shorten(info['ionisation_source'])
            metadata['Sample_Preparation']['Sample_Stabilisation'] = info['sample_stabilisation']
            metadata['Additional_Information']['Publication_DOI'] = info['doi']

        config = sm_engine_config(metadata)
        d = self._s3dir(imzml_fn)
        self._bucket.put_object(Key=d + "/config.json", Body=json.dumps(config).encode('utf-8'))
        self._bucket.put_object(Key=d + "/meta.json", Body=json.dumps(metadata).encode('utf-8'))

    def _createTasks(self, targets):
        jobs = []
        for imzml, ibd in targets:
            input_path = self._copyDataToS3(imzml, ibd)
            ds_name = self._institution + "//" + input_path.split("/")[-1]
            self._uploadMetadata(imzml, ds_name)
            ds_id = datetime.now().strftime("%Y-%m-%d_%Hh%Mm%Ss")
            jobs.append({
                "input_path": input_path,
                "ds_name": ds_name,
                "ds_id": ds_id
            })
        return jobs

    def _copyFiles(self):
        """
        Downloads metadata and centroided imzML files to a temporary directory,
        then copies files to the S3 bucket, putting them into structure expected by sm-engine.
        """
        self._uploaded_to_s3 = {obj.key for obj in self._bucket.objects.filter(Prefix=self._study_rel_dir)}

        self._ftp = self._ftpConnection()
        filenames = []
        self._ftp.retrlines('NLST', filenames.append)

        for fn in filenames:
            if fn.endswith(".txt"):
                self._fetchFromFTP(fn)

        if self._parse_isatab:
            print("Parsing ISATab metadata")
            self._study = ip.parse(self._study_dir).studies[0]
            self._info = self._extractStudyMetadata(self._study)
        else:
            self._study = self._info = None

        print("Copying datasets to S3")
        targets = self._centroidedDatasets(filenames)
        self._jobs = self._createTasks(targets)

        print("Ready to submit jobs")

    def _putObject(self, local_filename, s3key):
        with open(local_filename, 'rb') as data:
            self._bucket.put_object(Key=s3key, Body=data)

    def _copyDataToS3(self, imzml, ibd):
        def upload(src, dst):
            if dst not in self._uploaded_to_s3:
                local_fn = self._fetchFromFTP(src)
                self._putObject(local_fn, dst)
                os.unlink(local_fn)

        s3dir = self._s3dir(imzml)
        upload(imzml, s3dir + "/data.imzML")
        upload(ibd, s3dir + "/data.ibd")
        return "s3a://" + self._bucket.name + "/" + s3dir

    def study(self):
        """
        Information about the study returned by ISATab parser
        """
        return self._study

    def run(self, job_queue, remove_previous_results=False):
        """
        Submits job descriptions into the queue.
        """
        for job in self._jobs:
            if remove_previous_results:
                job['drop'] = True
            job_queue.publish(job)

    def cleanup(self):
        """
        Removes temporary files
        """
        import shutil
        shutil.rmtree(self._study_dir)
