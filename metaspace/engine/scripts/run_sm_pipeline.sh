#!/usr/bin/env bash
# To run the script cd engine/scripts/ The set-up requires a config.json file with database properties to be present in the webserver directory.

if [ $# -lt 5 ]; then
    echo "Usage: ./run_sm_pipeline.sh -ds <s3_dataset_path> -d <local_data_dir> -c <code_dir> -r <rows> -c <columns>"
    exit
fi

while [[ $# > 0 ]]
    do
    key="$1"

    case $key in
        -ds|--dsname)
        S3_PATH="$2"
        shift # past argument
        ;;
        -d|--dir)
        LOCAL_DATA_DIR="$2"
        shift # past argument
        ;;
        -c|--cdir)
        CODE_DIR="$2"
        shift # past argument
        ;;
        -r|--rows)
        ROWS="$2"
        shift # past argument
        ;;
        -c|--cols)
        COLS="$2"
        shift # past argument
        ;;
        *)
        # unknown option
        ;;
    esac
    shift # past argument or value
done


echo "  === [1] Prepare input data ===  "
aws s3 cp $S3_PATH $LOCAL_DATA_DIR
wait

ZIP_FILE=basename $S3_PATH
unzip $LOCAL_DATA_DIR/$ZIP_FILE -d $LOCAL_DATA_DIR
wait

echo "  === [2] Run imzML->text conversion ===  "
BARE_FN="${ZIP_FILE%.*}"
TXT_FN=${BARE_FN}.txt
python $CODE_DIR/engine/imzml_to_txt.py $LOCAL_DATA_DIR/$BARE_FN.imzML $LOCAL_DATA_DIR/$BARE_FN.txt $LOCAL_DATA_DIR/$BARE_FN_coord.txt

S3_DIR=$(dirname "${S3_PATH}")
aws s3 cp ${LOCAL_DATA_DIR}/${TXT_FN} ${S3_DIR}

echo "  === [3] Prepare queries file ===  "
python $CODE_DIR/engine/scripts/run_save_queries.py --config=$CODE_DIR/config.json --out=$LOCAL_DATA_DIR/queries.pkl

echo "  === [4] Put code and data to Spark master ===  "
ssh spark-master 'rm -r ~/sm'
ssh spark-master 'mkdir ~/sm; mkdir ~/sm/data;'
scp $LOCAL_DATA_DIR/queries.pkl spark-master:~/sm/data/
scp -r $CODE_DIR/engine spark-master:~/sm/

echo "  === [5] Start dataset processing in Spark ===  "
ssh spark-master '~/spark/bin/spark-submit --executor-memory 6G --py-files=/root/sm/engine.zip /root/sm/engine/scripts/run_process_dataset.py --out=/root/sm/data/${BARE_FN}_results_ts.pkl --ds=${S3_DIR}/${TXT_FN} --rows=${ROWS} --cols=${COLS} --queries=/root/sm/data/queries.pkl'

echo "  === [6] Inserting results ===  "
scp -e ssh spark-master:/root/sm/data/${BARE_FN}_results_ts.pkl ${LOCAL_DATA_DIR}
python ${CODE_DIR}/engine/run_insert_to_db.py --in="$LOCAL_DATA_DIR/${BARE_FN}_results_ts.pkl"

echo "  === Ready! ===  "




