#!/bin/bash
# To run the script cd engine/scripts/ The set-up requires a config.json file with database properties to be present in the webserver directory. 

if [ $# -lt 5 ]; then
    echo "Usage: ./run_insert_new_dataset.sh -dsn <dataset_name> -d <input_dir> -f <input_filename> -r <rows> -c <columns>"
    exit
fi

while [[ $# > 0 ]]
do
key="$1"

case $key in
    -dsn|--dsname)
    DATASET="$2"
    shift # past argument
    ;;
    -d|--dir)
    DIRECTORY_PATH="$2"
    shift # past argument
    ;;
    -f|--filename)
    FILENAME="$2"
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

echo "You have passed parameters:"
echo DATASET  =  "${DATASET}"
echo DIRECTORY PATH  = "${DIRECTORY_PATH}"
echo INPUT FILENAME  = "${FILENAME}"
echo ROWS  = "${ROWS}"
echo COLS  = "${COLS}"

echo "      === [1] Convert from imzML to txt ==="
echo " Usage: imzml_to_txt.py <input file> <data output file> [<coordinate output file]"
python imzml_to_txt.py ${DIRECTORY_PATH}/${FILENAME}.imzML ${DIRECTORY_PATH}/${FILENAME}.txt ${DIRECTORY_PATH}/${FILENAME}_coord.txt

wait

# This step is only performed if the formulas or the way to generate queries (e.g. tolerance) changes
echo "	     === [2] Generate queries ==="
python run_save_queries.py --config=../config.json --out=${DIRECTORY_PATH}/queries.pkl

wait

timestamp=`date +"%s"`

echo "      === [3] Process the dataset  ==="
$SPARK_HOME/bin/spark-submit --master spark://sparkvm:7077 --py-files=../blockentropy.py,../util.py,../computing.py run_process_dataset.py --out=${DIRECTORY_PATH}/${DATASET}_result_${timestamp}.pkl --ds=${DIRECTORY_PATH}/${FILENAME}.txt --rows=${ROWS} --cols=${COLS} --queries=${DIRECTORY_PATH}/queries.pkl

wait

echo "      === [4] Add results to the database ==="
python run_insert_to_db.py --ip=${DIRECTORY_PATH}/${FILENAME}.txt --rp=${DIRECTORY_PATH}/${DATASET}_result.pkl --cp=${DIRECTORY_PATH}/${FILENAME}_coord.txt --dsname=${DATASET} --config=../config.json --rows=134 --cols=260

echo "All done!"
